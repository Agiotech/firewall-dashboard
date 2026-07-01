import time

from fastapi import APIRouter

from ...cache.database import get_db
from ...config import settings

router = APIRouter()


RANGE_MAP = {
    "1h": 3600,
    "6h": 6 * 3600,
    "24h": 86400,
    "7d": 7 * 86400,
    "15d": 15 * 86400,
    "30d": 30 * 86400,
    "90d": 90 * 86400,
}


@router.get("/heatmaps/wan-saturation")
async def wan_saturation_hour_day(wan: str, range: str = "30d") -> dict:
    """Average utilization by (weekday, hour) for a WAN, from raw wan_metrics."""
    range_s = RANGE_MAP.get(range, 30 * 86400)
    since = int(time.time()) - range_s

    async with get_db() as db:
        cur = await db.execute(
            """
            SELECT
                CAST(strftime('%w', ts, 'unixepoch', 'localtime') AS INTEGER) AS dow,
                CAST(strftime('%H', ts, 'unixepoch', 'localtime') AS INTEGER) AS hour,
                AVG(bps_in + bps_out) AS bps_avg,
                MAX(bps_in + bps_out) AS bps_max,
                COUNT(*) AS samples
            FROM wan_metrics
            WHERE wan_name = ? AND ts >= ?
            GROUP BY dow, hour
            ORDER BY dow, hour
            """,
            (wan, since),
        )
        rows = [dict(r) for r in await cur.fetchall()]

    return {"data": rows, "range_s": range_s, "meta": {"wan": wan}}


@router.get("/heatmaps/wan-consumption")
async def wan_consumption_hour_day(wan: str, range: str = "30d") -> dict:
    """Total bytes (in + out) by (weekday, hour) for a WAN.

    Computed as SUM(bps_in + bps_out) * poll_interval / 8 — each sample
    represents the average rate during one polling interval, so total bits
    equals rate × time, and bytes = bits / 8.
    """
    range_s = RANGE_MAP.get(range, 30 * 86400)
    since = int(time.time()) - range_s
    poll_s = max(1, settings.poll_interval_seconds)

    async with get_db() as db:
        cur = await db.execute(
            """
            SELECT
                CAST(strftime('%w', ts, 'unixepoch', 'localtime') AS INTEGER) AS dow,
                CAST(strftime('%H', ts, 'unixepoch', 'localtime') AS INTEGER) AS hour,
                SUM(bps_in)  AS sum_bps_in,
                SUM(bps_out) AS sum_bps_out,
                COUNT(*) AS samples
            FROM wan_metrics
            WHERE wan_name = ? AND ts >= ?
            GROUP BY dow, hour
            ORDER BY dow, hour
            """,
            (wan, since),
        )
        rows: list[dict] = []
        for r in await cur.fetchall():
            d = dict(r)
            bytes_in = int((d["sum_bps_in"] or 0) * poll_s / 8)
            bytes_out = int((d["sum_bps_out"] or 0) * poll_s / 8)
            rows.append({
                "dow": d["dow"],
                "hour": d["hour"],
                "bytes_in": bytes_in,
                "bytes_out": bytes_out,
                "bytes_total": bytes_in + bytes_out,
                "samples": d["samples"],
            })
    return {"data": rows, "range_s": range_s, "meta": {"wan": wan}, "poll_interval_s": poll_s}


@router.get("/heatmaps/events-hour-day")
async def events_hour_day(range: str = "7d") -> dict:
    """Event count by (weekday, hour) — useful to see attack/drop patterns."""
    range_map = {"24h": 86400, "7d": 7 * 86400, "30d": 30 * 86400}
    range_s = range_map.get(range, 7 * 86400)
    since = int(time.time()) - range_s
    async with get_db() as db:
        cur = await db.execute(
            """
            SELECT
                CAST(strftime('%w', ts, 'unixepoch', 'localtime') AS INTEGER) AS dow,
                CAST(strftime('%H', ts, 'unixepoch', 'localtime') AS INTEGER) AS hour,
                COUNT(*) AS n
            FROM events
            WHERE ts >= ?
            GROUP BY dow, hour
            ORDER BY dow, hour
            """,
            (since,),
        )
        rows = [dict(r) for r in await cur.fetchall()]
    return {"data": rows, "range_s": range_s}


@router.get("/events/severity-series")
async def events_severity_series(range: str = "1h") -> dict:
    """Events grouped into time buckets and severity."""
    range_map = {"1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 3600)
    bucket = 60 if range_s <= 3600 else 300 if range_s <= 86400 else 3600
    since = int(time.time()) - range_s
    async with get_db() as db:
        cur = await db.execute(
            f"""
            SELECT
                (ts / {bucket}) * {bucket} AS bucket_ts,
                priority,
                COUNT(*) AS n
            FROM events
            WHERE ts >= ?
            GROUP BY bucket_ts, priority
            ORDER BY bucket_ts ASC
            """,
            (since,),
        )
        rows = [dict(r) for r in await cur.fetchall()]
    return {"data": rows, "bucket_s": bucket, "range_s": range_s}
