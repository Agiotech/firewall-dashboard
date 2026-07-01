import logging
import time

from ..cache.database import get_db

log = logging.getLogger(__name__)

BUCKET_5M = 300


async def rollup_5m() -> int:
    """Aggregate raw wan_metrics into 5-minute buckets. Returns rows inserted."""
    now = int(time.time())
    boundary = (now // BUCKET_5M) * BUCKET_5M  # current bucket start, not yet complete

    async with get_db() as db:
        cur = await db.execute("SELECT MAX(ts) AS last_ts FROM wan_metrics_5m")
        row = await cur.fetchone()
        last_ts = (row["last_ts"] or 0) if row else 0
        start = max(last_ts + BUCKET_5M, now - 7 * 86400)

        cur = await db.execute(
            """
            SELECT
                (ts / ?) * ? AS bucket_ts,
                wan_name,
                AVG(oper_status) AS oper_pct,
                AVG(bps_in) AS bps_in_avg, MAX(bps_in) AS bps_in_max,
                AVG(bps_out) AS bps_out_avg, MAX(bps_out) AS bps_out_max
            FROM wan_metrics
            WHERE ts >= ? AND ts < ?
            GROUP BY bucket_ts, wan_name
            ORDER BY bucket_ts ASC
            """,
            (BUCKET_5M, BUCKET_5M, start, boundary),
        )
        rows = await cur.fetchall()
        count = 0
        for r in rows:
            await db.execute(
                "INSERT OR REPLACE INTO wan_metrics_5m"
                "(ts, wan_name, oper_pct, bps_in_avg, bps_in_max, bps_out_avg, bps_out_max)"
                " VALUES (?,?,?,?,?,?,?)",
                (
                    r["bucket_ts"], r["wan_name"], r["oper_pct"],
                    r["bps_in_avg"], r["bps_in_max"], r["bps_out_avg"], r["bps_out_max"],
                ),
            )
            count += 1
        await db.commit()
        if count:
            log.info("Rollup 5m inserted %d rows", count)
        return count
