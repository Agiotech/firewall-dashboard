import ipaddress
import logging
import time

from ..cache.database import get_db
from ..config import settings
from ..services import devices as dev_svc
from ..services import dhcp as dhcp_svc
from .channels.email import send_email
from .channels.webhook import send_webhook


def _is_private(ip: str) -> bool:
    try:
        a = ipaddress.ip_address(ip)
        return a.is_private and not a.is_loopback and not a.is_link_local
    except ValueError:
        return False


def _format_bytes(b: int) -> str:
    if b >= 1e9:
        return f"{b / 1e9:.1f} GB"
    if b >= 1e6:
        return f"{b / 1e6:.1f} MB"
    if b >= 1e3:
        return f"{b / 1e3:.1f} KB"
    return f"{b} B"

log = logging.getLogger(__name__)


_active: dict[str, dict] = {}


async def _notify(rule_id: str, severity: str, subject: str, message: str) -> None:
    await send_webhook(rule_id, severity, subject, message)
    await send_email(rule_id, severity, subject, message)


async def _open(key: str, rule_id: str, severity: str, subject: str, message: str,
                 extra: dict | None = None) -> None:
    if key in _active:
        return
    state = {
        "rule_id": rule_id,
        "severity": severity,
        "subject": subject,
        "started_at": int(time.time()),
    }
    if extra:
        state.update(extra)
    _active[key] = state
    await _notify(rule_id, severity, subject, message)


async def _close(key: str, recovery_message: str) -> None:
    state = _active.pop(key, None)
    if not state:
        return
    duration = int(time.time()) - state["started_at"]
    await _notify(
        state["rule_id"], state["severity"],
        f"RECOVERED: {state['subject']}",
        f"{recovery_message} (was active {duration}s)",
    )


async def evaluate_once() -> None:
    """Evaluate basic rules. State persists in `_active`."""
    now = int(time.time())

    async with get_db() as db:
        cur = await db.execute("""
            SELECT m.wan_name, m.oper_status
            FROM wan_metrics m
            INNER JOIN (
                SELECT wan_name, MAX(ts) AS max_ts
                FROM wan_metrics
                GROUP BY wan_name
            ) latest ON m.wan_name = latest.wan_name AND m.ts = latest.max_ts
        """)
        wan_rows = await cur.fetchall()

        cur = await db.execute(
            "SELECT ts, cpu_pct, mem_pct, sessions FROM system_metrics ORDER BY ts DESC LIMIT 1"
        )
        sys_row = await cur.fetchone()

    # WAN_DOWN per interface
    for r in wan_rows:
        wan = r["wan_name"]
        oper = int(r["oper_status"])
        key = f"WAN_DOWN:{wan}"
        if oper == 0:
            await _open(
                key, "WAN_DOWN", "HIGH", f"WAN {wan} DOWN",
                f"Detected at {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(now))}",
            )
        elif key in _active:
            await _close(key, f"WAN {wan} back UP")

    # WAN_ALL_DOWN
    if wan_rows and all(int(r["oper_status"]) == 0 for r in wan_rows) and len(wan_rows) >= len(settings.wan_list):
        await _open(
            "WAN_ALL_DOWN", "WAN_ALL_DOWN", "CRITICAL",
            "ALL WANs DOWN", "Total internet outage detected.",
        )
    elif "WAN_ALL_DOWN" in _active:
        await _close("WAN_ALL_DOWN", "At least one WAN recovered.")

    # FW_UNREACHABLE — no system metrics for > 3 polling intervals
    threshold = 3 * settings.poll_interval_seconds
    if sys_row is None or (now - int(sys_row["ts"])) > threshold:
        await _open(
            "FW_UNREACHABLE", "FW_UNREACHABLE", "CRITICAL",
            "Firewall unreachable",
            f"No SNMP data received in the last {threshold}s.",
        )
    else:
        if "FW_UNREACHABLE" in _active:
            await _close("FW_UNREACHABLE", "SNMP data flowing again.")

        cpu = float(sys_row["cpu_pct"] or 0)
        mem = float(sys_row["mem_pct"] or 0)

        if cpu > settings.fw_cpu_threshold:
            await _open(
                "FW_HIGH_CPU", "FW_HIGH_CPU", "MEDIUM",
                f"Firewall CPU {cpu:.0f}%",
                f"CPU above {settings.fw_cpu_threshold}% threshold.",
            )
        elif "FW_HIGH_CPU" in _active:
            await _close("FW_HIGH_CPU", f"CPU back to {cpu:.0f}%")

        if mem > settings.fw_mem_threshold:
            await _open(
                "FW_HIGH_MEM", "FW_HIGH_MEM", "MEDIUM",
                f"Firewall MEM {mem:.0f}%",
                f"Memory above {settings.fw_mem_threshold}% threshold.",
            )
        elif "FW_HIGH_MEM" in _active:
            await _close("FW_HIGH_MEM", f"MEM back to {mem:.0f}%")


    # DEVICE_TRAFFIC_HIGH — top device over threshold in the recent window
    window_min = settings.device_traffic_window_minutes
    window_s = window_min * 60
    thresh_bytes = int(settings.device_traffic_high_mbps * 1_000_000 / 8 * window_s)
    try:
        tops = await dev_svc.device_traffic_top(window_s, limit=10)
    except Exception as e:
        log.warning("device_traffic_top failed: %s", e)
        tops = []

    seen_offenders: set[str] = set()
    for row in tops:
        ip = row["ip"]
        total = row.get("bytes_total", 0) or 0
        key = f"DEVICE_TRAFFIC_HIGH:{ip}"
        if total >= thresh_bytes:
            seen_offenders.add(ip)
            if key in _active:
                continue  # already firing; subject snapshot stays
            mbps = total * 8 / 1_000_000 / window_s

            # Enrich: find top peers talking to this IP
            try:
                peers = await dev_svc.top_peers_for_ip(ip, window_s, limit=5)
            except Exception as e:
                log.warning("peer lookup failed for %s: %s", ip, e)
                peers = []

            # Enrich the subject IP and each peer IP with DHCP info (hostname/description)
            try:
                lookup_ips = [ip] + [p["ip"] for p in peers]
                dhcp_map = await dhcp_svc.bulk_lookup(lookup_ips)
            except Exception as e:
                log.warning("dhcp bulk lookup failed: %s", e)
                dhcp_map = {}

            for p in peers:
                d = dhcp_map.get(p["ip"])
                if d:
                    p["hostname"] = d.get("hostname")
                    p["description"] = d.get("description")
                    p["mac"] = d.get("mac")

            label = "LAN" if _is_private(ip) else "EXT"
            subj_info = dhcp_map.get(ip) or {}
            subject_extra = ""
            if subj_info.get("hostname"):
                subject_extra = f" {subj_info['hostname']}"
                if subj_info.get("description"):
                    subject_extra += f" - {subj_info['description']}"
            subject = f"{ip} ({label}){subject_extra} - {mbps:.1f} Mbps"

            if peers:
                def _peer_line(p: dict) -> str:
                    label_p = ""
                    if p.get("hostname"):
                        label_p = f"  ({p['hostname']}"
                        if p.get("description"):
                            label_p += f" - {p['description']}"
                        label_p += ")"
                    return f"  - {p['ip']}{label_p}: {_format_bytes(int(p['total_bytes']))}"

                peer_lines = "\n".join(_peer_line(p) for p in peers)
                message = (
                    f"Device {ip} ({label}) averaged {mbps:.1f} Mbps over last {window_min}m\n"
                    f"(threshold {settings.device_traffic_high_mbps:.0f} Mbps).\n\n"
                    f"Top peers in this window:\n{peer_lines}"
                )
            else:
                message = (
                    f"Device {ip} ({label}) averaged {mbps:.1f} Mbps over last {window_min}m\n"
                    f"(threshold {settings.device_traffic_high_mbps:.0f} Mbps). No peer data available."
                )

            await _open(
                key, "DEVICE_TRAFFIC_HIGH", "MEDIUM",
                subject, message,
                extra={"peers": peers, "mbps": mbps, "is_private": _is_private(ip)},
            )
    # Close any previously firing DEVICE_TRAFFIC_HIGH that's no longer in tops
    for key in list(_active.keys()):
        if key.startswith("DEVICE_TRAFFIC_HIGH:"):
            ip = key.split(":", 1)[1]
            if ip not in seen_offenders:
                await _close(key, f"Device {ip} traffic back to normal.")


def active_alerts() -> list[dict]:
    out = []
    for v in _active.values():
        item = {
            "rule_id": v["rule_id"],
            "severity": v["severity"],
            "subject": v["subject"],
            "started_at": v["started_at"],
        }
        if "peers" in v:
            item["peers"] = v["peers"]
        if "mbps" in v:
            item["mbps"] = v["mbps"]
        if "is_private" in v:
            item["is_private"] = v["is_private"]
        out.append(item)
    return out
