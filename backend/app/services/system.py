import time

from ..cache.database import get_db


async def get_latest_system() -> dict | None:
    async with get_db() as db:
        cur = await db.execute(
            "SELECT ts, cpu_pct, mem_pct, sessions, uptime_sec FROM system_metrics "
            "ORDER BY ts DESC LIMIT 1"
        )
        row = await cur.fetchone()
        return dict(row) if row else None


async def get_system_series(range_s: int) -> list[dict]:
    since = int(time.time()) - range_s
    async with get_db() as db:
        cur = await db.execute(
            "SELECT ts, cpu_pct, mem_pct, sessions FROM system_metrics "
            "WHERE ts >= ? ORDER BY ts ASC",
            (since,),
        )
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def get_sparkline(field: str, points: int = 30, window_s: int = 60) -> list[float]:
    if field not in {"cpu_pct", "mem_pct", "sessions"}:
        raise ValueError(f"Bad field {field}")
    total = points * window_s
    series = await get_system_series(total)
    if not series:
        return [0.0] * points
    now = int(time.time())
    out: list[float] = []
    for i in range(points, 0, -1):
        end = now - (i - 1) * window_s
        start = end - window_s
        vals = [r[field] for r in series if start <= r["ts"] < end and r[field] is not None]
        out.append(sum(vals) / len(vals) if vals else 0.0)
    return out
