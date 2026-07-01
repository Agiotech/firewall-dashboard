import asyncio
import ipaddress
import logging
import time
from collections import defaultdict

from ..cache import database as db
from ..config import settings
from .parser import ParseError, parse_v9

log = logging.getLogger(__name__)


_BUCKET_S = 60
_FLUSH_S = 30


def is_private_ip(ip: str) -> bool:
    if not ip:
        return False
    try:
        addr = ipaddress.ip_address(ip)
        return addr.is_private or addr.is_loopback or addr.is_link_local
    except ValueError:
        return False


class NetflowProtocol(asyncio.DatagramProtocol):
    def __init__(self) -> None:
        # Templates keyed by (source_addr, template_id)
        self.templates: dict[tuple[str, int], list[tuple[int, int]]] = {}
        # In-memory aggregation buffer: (bucket, src_ip, dst_ip) -> (bytes, packets)
        self.buffer: dict[tuple[int, str, str], list[int]] = defaultdict(lambda: [0, 0])
        self.transport: asyncio.DatagramTransport | None = None

    def connection_made(self, transport):  # noqa: D401
        self.transport = transport

    def datagram_received(self, data: bytes, addr: tuple) -> None:
        peer = addr[0]
        try:
            src_templates = {
                tid: fields
                for (src, tid), fields in self.templates.items()
                if src == peer
            }
            flows = parse_v9(data, src_templates)
            for tid, fields in src_templates.items():
                self.templates[(peer, tid)] = fields
        except ParseError as e:
            log.debug("netflow parse error from %s: %s", peer, e)
            return
        except Exception as e:
            log.warning("netflow parse exception from %s: %s", peer, e)
            return

        now = int(time.time())
        bucket = (now // _BUCKET_S) * _BUCKET_S
        for f in flows:
            if not f.bytes_:
                continue
            key = (bucket, f.src_ip, f.dst_ip)
            slot = self.buffer[key]
            slot[0] += f.bytes_
            slot[1] += f.packets

    async def flush_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(_FLUSH_S)
                await self._flush()
            except asyncio.CancelledError:
                await self._flush()
                raise
            except Exception as e:
                log.exception("netflow flush failed: %s", e)

    async def _flush(self) -> None:
        if not self.buffer:
            return
        rows = [
            (bucket, src, dst, b, p)
            for (bucket, src, dst), (b, p) in self.buffer.items()
        ]
        self.buffer.clear()
        await db.upsert_flow_bulk(rows)
        log.info("NetFlow flushed %d aggregates", len(rows))


_transport: asyncio.DatagramTransport | None = None
_flush_task: asyncio.Task | None = None
_protocol: NetflowProtocol | None = None


async def start_netflow_server() -> bool:
    """Start NetFlow v9 listener if enabled. Returns True if listening."""
    global _transport, _flush_task, _protocol
    if not getattr(settings, "netflow_enabled", False):
        return False
    if _transport is not None:
        return True
    loop = asyncio.get_running_loop()
    try:
        host = getattr(settings, "netflow_bind_host", "0.0.0.0")
        port = getattr(settings, "netflow_bind_port", 2055)
        _protocol = NetflowProtocol()
        transport, _ = await loop.create_datagram_endpoint(
            lambda: _protocol,  # type: ignore
            local_addr=(host, port),
        )
        _transport = transport
        _flush_task = asyncio.create_task(_protocol.flush_loop())
        log.info("NetFlow v9 listener on %s:%s", host, port)
        return True
    except OSError as e:
        log.warning("Could not bind NetFlow listener: %s", e)
        return False


def stop_netflow_server() -> None:
    global _transport, _flush_task
    if _flush_task is not None:
        _flush_task.cancel()
        _flush_task = None
    if _transport is not None:
        _transport.close()
        _transport = None
