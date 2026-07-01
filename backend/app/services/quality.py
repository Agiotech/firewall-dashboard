import time

from ..cache.database import get_db


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * (p / 100)
    f = int(k)
    c = min(f + 1, len(s) - 1)
    if f == c:
        return s[f]
    return s[f] + (s[c] - s[f]) * (k - f)


async def get_quality_series(target: str | None, range_s: int) -> list[dict]:
    since = int(time.time()) - range_s
    async with get_db() as db:
        if target:
            cur = await db.execute(
                "SELECT ts, target, latency_ms, jitter_ms, loss_pct FROM internet_quality "
                "WHERE ts >= ? AND target = ? ORDER BY ts ASC",
                (since, target),
            )
        else:
            cur = await db.execute(
                "SELECT ts, target, latency_ms, jitter_ms, loss_pct FROM internet_quality "
                "WHERE ts >= ? ORDER BY ts ASC",
                (since,),
            )
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def get_quality_percentiles(target: str, range_s: int) -> dict:
    rows = await get_quality_series(target, range_s)
    rtts = [r["latency_ms"] for r in rows if r["latency_ms"] and r["latency_ms"] > 0]
    losses = [r["loss_pct"] for r in rows if r["loss_pct"] is not None]
    jitters = [r["jitter_ms"] for r in rows if r["jitter_ms"] is not None]
    return {
        "target": target,
        "samples": len(rtts),
        "p50": percentile(rtts, 50),
        "p90": percentile(rtts, 90),
        "p99": percentile(rtts, 99),
        "avg": sum(rtts) / len(rtts) if rtts else 0.0,
        "loss_avg": sum(losses) / len(losses) if losses else 0.0,
        "jitter_avg": sum(jitters) / len(jitters) if jitters else 0.0,
        "range_s": range_s,
    }


async def latest_by_target() -> dict[str, dict]:
    async with get_db() as db:
        cur = await db.execute("""
            SELECT q.target, q.ts, q.latency_ms, q.jitter_ms, q.loss_pct
            FROM internet_quality q
            INNER JOIN (
                SELECT target, MAX(ts) AS max_ts
                FROM internet_quality
                GROUP BY target
            ) latest ON q.target = latest.target AND q.ts = latest.max_ts
        """)
        rows = await cur.fetchall()
        return {r["target"]: dict(r) for r in rows}
