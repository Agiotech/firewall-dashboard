import time

from ..cache.database import get_db


async def get_lan_latest() -> list[dict]:
    async with get_db() as db:
        cur = await db.execute("""
            SELECT m.port_name, m.ts, m.oper_status, m.bps_in, m.bps_out,
                   m.errors_in, m.errors_out, m.speed_mbps
            FROM lan_metrics m
            INNER JOIN (
                SELECT port_name, MAX(ts) AS max_ts
                FROM lan_metrics
                GROUP BY port_name
            ) latest ON m.port_name = latest.port_name AND m.ts = latest.max_ts
        """)
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def errors_heatmap(range_s: int, bucket_s: int = 600) -> dict:
    """Return matrix [port_name][bucket_ts] with in/out split for the heatmap."""
    since = int(time.time()) - range_s
    async with get_db() as db:
        cur = await db.execute(
            f"""
            SELECT port_name,
                   (ts / {bucket_s}) * {bucket_s} AS bucket_ts,
                   AVG(errors_in)  AS errs_in_avg,
                   AVG(errors_out) AS errs_out_avg,
                   MAX(errors_in)  AS errs_in_max,
                   MAX(errors_out) AS errs_out_max,
                   COUNT(*)        AS samples
            FROM lan_metrics
            WHERE ts >= ?
            GROUP BY port_name, bucket_ts
            ORDER BY bucket_ts ASC
            """,
            (since,),
        )
        rows: list[dict] = []
        for r in await cur.fetchall():
            d = dict(r)
            d["errs"] = (d.get("errs_in_avg") or 0) + (d.get("errs_out_avg") or 0)
            rows.append(d)
    ports = sorted({r["port_name"] for r in rows})
    buckets = sorted({int(r["bucket_ts"]) for r in rows})
    return {
        "ports": ports,
        "buckets": buckets,
        "data": rows,
        "bucket_s": bucket_s,
        "range_s": range_s,
    }


async def errors_detail(port: str, range_s: int) -> list[dict]:
    """Full error time series for a single port, with in/out separated."""
    since = int(time.time()) - range_s
    async with get_db() as db:
        cur = await db.execute(
            "SELECT ts, errors_in, errors_out, oper_status, bps_in, bps_out "
            "FROM lan_metrics WHERE port_name = ? AND ts >= ? ORDER BY ts ASC",
            (port, since),
        )
        return [dict(r) for r in await cur.fetchall()]


async def get_lan_series(port: str, range_s: int) -> list[dict]:
    since = int(time.time()) - range_s
    async with get_db() as db:
        cur = await db.execute(
            "SELECT ts, oper_status, bps_in, bps_out, errors_in, errors_out, speed_mbps "
            "FROM lan_metrics WHERE port_name = ? AND ts >= ? ORDER BY ts ASC",
            (port, since),
        )
        return [dict(r) for r in await cur.fetchall()]
