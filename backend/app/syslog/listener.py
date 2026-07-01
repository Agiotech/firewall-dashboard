import asyncio
import logging
import time
from collections import defaultdict

from ..cache import database as db
from ..config import settings
from .parsers import extract_vpn_info, parse_zyxel

log = logging.getLogger(__name__)


_FLOW_BUCKET_S = 60
_FLOW_FLUSH_S = 30
_TRAFFIC_CAT = "Traffic Log"
_REBIND_BACKOFF_S = 30
_WATCHDOG_INTERVAL_S = 60
_WATCHDOG_STALE_S = 600  # 10 min without packets => degraded


# Public status surface (read by API endpoint + frontend badge)
_status: dict = {
    "state": "stopped",           # stopped | binding | running | degraded | bind_failed
    "bound_addr": None,
    "bound_at": None,
    "last_packet_ts": None,
    "last_parsed_ts": None,
    "packets_total": 0,
    "packets_filtered_acl": 0,
    "packets_parsed": 0,
    "parse_failures": 0,
    "bind_attempts": 0,
    "last_error": None,
    "transport_alive": False,
}


def get_status() -> dict:
    """Snapshot of listener state for the API."""
    snap = dict(_status)
    now = int(time.time())
    if snap.get("last_packet_ts"):
        snap["last_packet_age_s"] = now - snap["last_packet_ts"]
    else:
        snap["last_packet_age_s"] = None
    if snap.get("bound_at"):
        snap["bound_age_s"] = now - snap["bound_at"]
    else:
        snap["bound_age_s"] = None
    # Promote to degraded if we bound but received no packet recently
    if snap["state"] == "running":
        bound_age = snap["bound_age_s"] or 0
        last_age = snap["last_packet_age_s"]
        if bound_age > _WATCHDOG_STALE_S and (last_age is None or last_age > _WATCHDOG_STALE_S):
            snap["state"] = "degraded"
    return snap


class SyslogProtocol(asyncio.DatagramProtocol):
    def __init__(self) -> None:
        self.allowed = settings.syslog_allowed_set
        self._flow_buffer: dict[tuple[int, str, str], list[int]] = defaultdict(lambda: [0, 0])
        self.transport: asyncio.DatagramTransport | None = None

    def connection_made(self, transport):  # noqa: D401
        self.transport = transport
        _status["transport_alive"] = True

    def connection_lost(self, exc):  # noqa: D401
        _status["transport_alive"] = False
        _status["state"] = "stopped"
        _status["last_error"] = f"connection_lost: {exc!r}" if exc else "connection_lost"
        log.error("Syslog transport lost: %r — listener needs rebind", exc)

    def error_received(self, exc):  # noqa: D401
        _status["last_error"] = f"error_received: {exc!r}"
        log.error("Syslog UDP error_received: %r", exc)

    def datagram_received(self, data: bytes, addr: tuple) -> None:
        _status["packets_total"] += 1
        _status["last_packet_ts"] = int(time.time())
        peer = addr[0]
        if self.allowed and peer not in self.allowed:
            _status["packets_filtered_acl"] += 1
            return
        try:
            line = data.decode("utf-8", errors="replace")
        except Exception:
            _status["parse_failures"] += 1
            return
        asyncio.create_task(self._handle_line(line))

    async def _handle_line(self, line: str) -> None:
        try:
            event = parse_zyxel(line)
            if event is None:
                _status["parse_failures"] += 1
                return
            _status["packets_parsed"] += 1
            _status["last_parsed_ts"] = int(time.time())
            if event.severity > settings.syslog_min_severity:
                return

            if event.category == _TRAFFIC_CAT:
                self._buffer_traffic(event)
                return

            now = int(time.time())
            await db.insert_event(
                ts=now,
                priority=event.priority_name,
                category=event.category or "unknown",
                message=event.message or "",
                src_ip=event.src_ip, src_port=event.src_port,
                dst_ip=event.dst_ip, dst_port=event.dst_port,
                action=event.action, note=event.note,
            )
            if event.category == "Connectivity Check" and event.message:
                msg = event.message.upper()
                for wan in settings.wan_list:
                    if wan.upper() in msg:
                        if "DEAD" in msg:
                            await db.insert_status_change(now, wan, 0)
                        elif "ALIVE" in msg:
                            await db.insert_status_change(now, wan, 1)
                        break

            if event.category == "IPSec VPN":
                await self._handle_vpn_event(event, now)
            elif event.category in ("L2TP", "SSL VPN", "PPP") or (
                event.category == "User" and event.message and "VPN" in event.message.upper()
            ):
                await self._handle_client_vpn_event(event, now)
        except Exception as e:
            log.warning("Syslog line failed: %s | line=%s", e, line[:200])

    async def _handle_vpn_event(self, event, now: int) -> None:
        info = extract_vpn_info(event.message)
        if not info:
            return
        tunnel = info.get("tunnel_name")
        evt_type = info.get("event_type", "info")
        if not tunnel:
            return

        peer_ip = None
        local_ip = None
        if event.src_ip and event.dst_ip:
            if event.src_ip.startswith("192.168.") or event.src_ip.startswith("10."):
                local_ip, peer_ip = event.src_ip, event.dst_ip
            else:
                if event.message and "sending" in event.message.lower():
                    local_ip, peer_ip = event.src_ip, event.dst_ip
                else:
                    peer_ip, local_ip = event.src_ip, event.dst_ip

        state = None
        if evt_type == "up":
            state = "UP"
        elif evt_type == "down":
            state = "DOWN"
        elif evt_type == "dpd":
            state = "UP"

        await db.upsert_vpn_tunnel(
            name=tunnel,
            peer_ip=peer_ip,
            local_ip=local_ip,
            state=state,
            last_event_msg=event.message,
            ts=now,
            dpd_seen=(evt_type == "dpd"),
            rekey_seen=(evt_type == "rekey"),
        )

    async def _handle_client_vpn_event(self, event, now: int) -> None:
        msg = (event.message or "").lower()
        username = event.user
        src_ip = event.src_ip

        vpn_type = None
        if "l2tp" in msg:
            vpn_type = "L2TP"
        elif "ssl vpn" in msg or "sslvpn" in msg:
            vpn_type = "SSL"
        elif "ikev2" in msg:
            vpn_type = "IKEv2"
        elif "ipsec" in msg:
            vpn_type = "IPSec"

        if "log out" in msg or "logout" in msg or "disconnect" in msg or "terminated" in msg:
            await db.close_vpn_session(username, src_ip, now)
        elif "log in" in msg or "login" in msg or "logged in" in msg or "authenticated" in msg:
            await db.open_or_update_vpn_session(username, src_ip, vpn_type, None, now)

    def _buffer_traffic(self, event) -> None:
        if not event.src_ip or not event.dst_ip:
            return
        bucket = (int(time.time()) // _FLOW_BUCKET_S) * _FLOW_BUCKET_S
        sent = event.sent_bytes or 0
        rcvd = event.rcvd_bytes or 0
        if sent > 0:
            slot = self._flow_buffer[(bucket, event.src_ip, event.dst_ip)]
            slot[0] += sent
            slot[1] += max(1, sent // 1500)
        if rcvd > 0:
            slot = self._flow_buffer[(bucket, event.dst_ip, event.src_ip)]
            slot[0] += rcvd
            slot[1] += max(1, rcvd // 1500)

    async def flush_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(_FLOW_FLUSH_S)
                await self._flush_flows()
            except asyncio.CancelledError:
                await self._flush_flows()
                raise
            except Exception as e:
                log.exception("Syslog flow flush failed: %s", e)

    async def _flush_flows(self) -> None:
        if not self._flow_buffer:
            return
        rows = [(b, s, d, by, pk) for (b, s, d), (by, pk) in self._flow_buffer.items()]
        self._flow_buffer.clear()
        await db.upsert_flow_bulk(rows)
        log.info("Syslog flushed %d traffic-log flow aggregates", len(rows))


_transport: asyncio.DatagramTransport | None = None
_flush_task: asyncio.Task | None = None
_protocol: SyslogProtocol | None = None
_supervisor_task: asyncio.Task | None = None
_watchdog_task: asyncio.Task | None = None
_shutdown_event: asyncio.Event | None = None


async def _record_loud_failure(reason: str) -> None:
    """Persist a high-priority event so the failure shows up in alerts/UI."""
    try:
        await db.insert_event(
            ts=int(time.time()),
            priority="error",
            category="monitor",
            message=f"Syslog listener: {reason}",
            src_ip=None, src_port=None,
            dst_ip=None, dst_port=None,
            action=None, note=None,
        )
    except Exception:
        log.exception("Failed to persist syslog failure event")


async def _try_bind_once() -> bool:
    """Attempt a single bind. Updates _transport, _protocol, _flush_task and status."""
    global _transport, _flush_task, _protocol
    loop = asyncio.get_running_loop()
    _status["bind_attempts"] += 1
    _status["state"] = "binding"
    try:
        protocol = SyslogProtocol()
        transport, _ = await loop.create_datagram_endpoint(
            lambda: protocol,
            local_addr=(settings.syslog_bind_host, settings.syslog_bind_port),
        )
        _transport = transport
        _protocol = protocol
        _flush_task = asyncio.create_task(protocol.flush_loop())
        _status["state"] = "running"
        _status["bound_addr"] = f"{settings.syslog_bind_host}:{settings.syslog_bind_port}"
        _status["bound_at"] = int(time.time())
        _status["last_error"] = None
        log.info(
            "Syslog UDP listener on %s:%s (min severity %s, allowed=%s)",
            settings.syslog_bind_host,
            settings.syslog_bind_port,
            settings.syslog_min_severity,
            sorted(settings.syslog_allowed_set) or "any",
        )
        return True
    except OSError as e:
        _status["state"] = "bind_failed"
        _status["last_error"] = f"OSError: {e}"
        log.error(
            "Syslog bind FAILED on %s:%s — %s (attempt #%d). Will retry in %ds.",
            settings.syslog_bind_host,
            settings.syslog_bind_port,
            e,
            _status["bind_attempts"],
            _REBIND_BACKOFF_S,
        )
        await _record_loud_failure(
            f"bind to {settings.syslog_bind_host}:{settings.syslog_bind_port} failed: {e}"
        )
        return False
    except Exception as e:
        _status["state"] = "bind_failed"
        _status["last_error"] = f"{type(e).__name__}: {e}"
        log.exception("Unexpected error during syslog bind")
        await _record_loud_failure(f"unexpected bind error: {e}")
        return False


async def _supervisor_loop() -> None:
    """Keep retrying the bind until the listener is healthy, then watch transport_alive."""
    assert _shutdown_event is not None
    while not _shutdown_event.is_set():
        if _status["state"] in ("stopped", "bind_failed"):
            ok = await _try_bind_once()
            if not ok:
                try:
                    await asyncio.wait_for(_shutdown_event.wait(), timeout=_REBIND_BACKOFF_S)
                except asyncio.TimeoutError:
                    pass
                continue
        # If the transport died (connection_lost), rebind
        if _status["state"] == "running" and not _status["transport_alive"]:
            log.warning("Syslog transport died; rebinding")
            _status["state"] = "stopped"
            continue
        try:
            await asyncio.wait_for(_shutdown_event.wait(), timeout=5)
        except asyncio.TimeoutError:
            pass


async def _watchdog_loop() -> None:
    """Periodically log the listener's health so silent stalls are visible."""
    assert _shutdown_event is not None
    while not _shutdown_event.is_set():
        try:
            await asyncio.wait_for(_shutdown_event.wait(), timeout=_WATCHDOG_INTERVAL_S)
            return
        except asyncio.TimeoutError:
            pass
        snap = get_status()
        if snap["state"] == "running":
            log.info(
                "Syslog health: state=%s packets=%d (acl_filtered=%d parsed=%d failures=%d) last_packet_age=%ss",
                snap["state"],
                snap["packets_total"],
                snap["packets_filtered_acl"],
                snap["packets_parsed"],
                snap["parse_failures"],
                snap["last_packet_age_s"],
            )
        elif snap["state"] == "degraded":
            log.warning(
                "Syslog DEGRADED: bound for %ss but no packets in %ss (allowed=%s)",
                snap["bound_age_s"],
                snap["last_packet_age_s"],
                sorted(settings.syslog_allowed_set) or "any",
            )


async def start_syslog_server() -> None:
    """Start the supervisor + watchdog. Returns immediately even if bind fails."""
    global _supervisor_task, _watchdog_task, _shutdown_event
    if _supervisor_task is not None:
        return
    _shutdown_event = asyncio.Event()
    # First attempt synchronously so the startup log is informative
    await _try_bind_once()
    _supervisor_task = asyncio.create_task(_supervisor_loop())
    _watchdog_task = asyncio.create_task(_watchdog_loop())


def stop_syslog_server() -> None:
    global _transport, _flush_task, _supervisor_task, _watchdog_task, _shutdown_event
    if _shutdown_event is not None:
        _shutdown_event.set()
    if _flush_task is not None:
        _flush_task.cancel()
        _flush_task = None
    if _transport is not None:
        _transport.close()
        _transport = None
    if _supervisor_task is not None:
        _supervisor_task.cancel()
        _supervisor_task = None
    if _watchdog_task is not None:
        _watchdog_task.cancel()
        _watchdog_task = None
    _status["state"] = "stopped"
    _status["transport_alive"] = False
