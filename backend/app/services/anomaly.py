"""Anomaly bands: compute p5/p95 of last N weeks at same (weekday, hour) bucket.

Compared with the current value at that bucket, we can visually flag outliers.
"""
import time

from ..cache.database import get_db


async def wan_anomaly_bands(wan: str, range_s: int = 86400, weeks: int = 4) -> dict:
    """Build series for the last `range_s` seconds:
       - actual: current bps_in+bps_out
       - p5/p95/median: percentiles for same weekday-hour from last `weeks` weeks
    """
    now = int(time.time())
    since_actual = now - range_s
    since_baseline = now - weeks * 7 * 86400

    async with get_db() as db:
        # Actual series (last range_s, raw)
        cur = await db.execute(
            "SELECT ts, bps_in, bps_out FROM wan_metrics "
            "WHERE wan_name = ? AND ts >= ? ORDER BY ts ASC",
            (wan, since_actual),
        )
        actual = [dict(r) for r in await cur.fetchall()]

        # Baseline: pull all samples in past weeks, bucket by (weekday, hour)
        cur = await db.execute(
            "SELECT ts, bps_in, bps_out FROM wan_metrics "
            "WHERE wan_name = ? AND ts >= ?",
            (wan, since_baseline),
        )
        baseline = [dict(r) for r in await cur.fetchall()]

    buckets: dict[tuple[int, int], list[float]] = {}
    for r in baseline:
        ts = int(r["ts"])
        # Use UTC for stability; client renders in local time
        import datetime as dt
        d = dt.datetime.utcfromtimestamp(ts)
        key = (d.weekday(), d.hour)
        v = (r["bps_in"] or 0) + (r["bps_out"] or 0)
        buckets.setdefault(key, []).append(v)

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

    band: list[dict] = []
    import datetime as dt
    for r in actual:
        d = dt.datetime.utcfromtimestamp(int(r["ts"]))
        key = (d.weekday(), d.hour)
        vals = buckets.get(key, [])
        v_actual = (r["bps_in"] or 0) + (r["bps_out"] or 0)
        band.append({
            "ts": r["ts"],
            "actual": v_actual,
            "p5": percentile(vals, 5),
            "median": percentile(vals, 50),
            "p95": percentile(vals, 95),
            "samples": len(vals),
        })
    return {"data": band, "weeks": weeks}
