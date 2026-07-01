import asyncio
import logging
import platform
import re
import time

from ..cache import database as db
from ..config import settings

log = logging.getLogger(__name__)


_RTT_WIN = re.compile(r"tiempo[=<](\d+)ms|time[=<](\d+(?:\.\d+)?) ?ms", re.IGNORECASE)
_LOSS_WIN = re.compile(r"perdidos\s*=\s*(\d+).*\((\d+)%|Lost\s*=\s*(\d+).*\((\d+)%", re.IGNORECASE)
_RTT_NIX = re.compile(r"time=(\d+(?:\.\d+)?) ?ms", re.IGNORECASE)
_LOSS_NIX = re.compile(r"(\d+)% packet loss")


async def _ping(target: str, count: int) -> tuple[list[float], float]:
    """Return (latencies_ms, loss_pct)."""
    if platform.system() == "Windows":
        cmd = ["ping", "-n", str(count), "-w", "2000", target]
    else:
        cmd = ["ping", "-c", str(count), "-W", "2", target]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=count * 3)
    except (asyncio.TimeoutError, FileNotFoundError) as e:
        log.warning("ping %s failed: %s", target, e)
        return [], 100.0

    text = stdout.decode("cp437" if platform.system() == "Windows" else "utf-8", errors="replace")
    rtts: list[float] = []
    for m in _RTT_WIN.finditer(text):
        v = m.group(1) or m.group(2)
        if v:
            rtts.append(float(v))
    if not rtts:
        for m in _RTT_NIX.finditer(text):
            rtts.append(float(m.group(1)))

    loss = 100.0
    m_loss = _LOSS_NIX.search(text)
    if m_loss:
        loss = float(m_loss.group(1))
    else:
        for m in _LOSS_WIN.finditer(text):
            val = m.group(2) or m.group(4)
            if val:
                loss = float(val)
                break
    if rtts and loss == 100.0:
        loss = max(0.0, (1 - len(rtts) / count) * 100)
    return rtts, loss


async def probe_once(target: str) -> dict | None:
    count = settings.quality_check_count
    rtts, loss = await _ping(target, count)
    if not rtts:
        await db.insert_quality(int(time.time()), target, 0.0, 0.0, loss)
        return {"target": target, "latency_ms": 0.0, "loss_pct": loss}

    avg = sum(rtts) / len(rtts)
    mean = avg
    var = sum((x - mean) ** 2 for x in rtts) / len(rtts)
    jitter = var ** 0.5
    ts = int(time.time())
    await db.insert_quality(ts, target, avg, jitter, loss)
    return {"target": target, "latency_ms": avg, "jitter_ms": jitter, "loss_pct": loss}


async def probe_all() -> list[dict]:
    if not settings.quality_check_enabled:
        return []
    results = []
    for target in settings.quality_targets_list:
        try:
            r = await probe_once(target)
            if r:
                results.append(r)
        except Exception as e:
            log.warning("probe %s failed: %s", target, e)
    return results
