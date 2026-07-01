import time
from datetime import datetime, timedelta

from ..cache.database import get_db
from ..config import settings


RANGE_MAP = {
    "5m": 300,
    "1h": 3600,
    "6h": 21600,
    "24h": 86400,
    "7d": 604800,
    "30d": 2592000,
    "90d": 7776000,
}


def parse_range(r: str) -> int:
    return RANGE_MAP.get(r, 3600)


async def get_wan_latest() -> list[dict]:
    """Latest metric per WAN, joined with last status change."""
    async with get_db() as db:
        cur = await db.execute("""
            SELECT m.wan_name, m.ts, m.oper_status, m.bps_in, m.bps_out, m.pps_in, m.pps_out
            FROM wan_metrics m
            INNER JOIN (
                SELECT wan_name, MAX(ts) AS max_ts
                FROM wan_metrics
                GROUP BY wan_name
            ) latest ON m.wan_name = latest.wan_name AND m.ts = latest.max_ts
        """)
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def get_wan_series(wan: str, range_s: int) -> list[dict]:
    since = int(time.time()) - range_s
    async with get_db() as db:
        cur = await db.execute(
            "SELECT ts, oper_status, bps_in, bps_out FROM wan_metrics "
            "WHERE wan_name = ? AND ts >= ? ORDER BY ts ASC",
            (wan, since),
        )
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def get_status_history(wan: str, range_s: int) -> list[dict]:
    since = int(time.time()) - range_s
    async with get_db() as db:
        cur = await db.execute(
            "SELECT ts, new_status FROM wan_status_changes "
            "WHERE wan_name = ? AND ts >= ? ORDER BY ts ASC",
            (wan, since),
        )
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def get_sparkline(wan: str, points: int = 30, window_s: int = 60) -> list[float]:
    """Last N buckets of `window_s` seconds, bps_in average."""
    total_window = points * window_s
    series = await get_wan_series(wan, total_window)
    if not series:
        return [0.0] * points
    now = int(time.time())
    buckets: list[float] = []
    for i in range(points, 0, -1):
        end = now - (i - 1) * window_s
        start = end - window_s
        in_bucket = [r["bps_in"] for r in series if start <= r["ts"] < end]
        buckets.append(sum(in_bucket) / len(in_bucket) if in_bucket else 0.0)
    return buckets


def wan_label(name: str) -> str:
    return settings.wan_labels_map.get(name, name)


async def get_availability_per_day(wan: str, days: int) -> list[dict]:
    """Per-day uptime % derived from Connectivity Check downtime intervals.

    Source of truth: wan_status_changes (ALIVE/DEAD events from the USG syslog
    Connectivity Check). We reconstruct UP/DOWN spans across the requested
    window — including the partial first/last days — and report uptime as
    100 * (1 - down_seconds / day_seconds). For today, the day_seconds is the
    elapsed portion (00:00 local → now) so the percentage is meaningful
    mid-day instead of being diluted by the whole 24h.
    """
    now = int(time.time())
    # Day boundaries in the server's local timezone so the calendar lines up
    # with the user's perception of "today".
    today_local = datetime.now().astimezone()
    today_start = today_local.replace(hour=0, minute=0, second=0, microsecond=0)
    earliest_day_start = today_start - timedelta(days=days)
    earliest_ts = int(earliest_day_start.timestamp())

    async with get_db() as db:
        # Initial state: last known status before the window. Default UP if
        # there's no history at all.
        cur = await db.execute(
            "SELECT new_status FROM wan_status_changes "
            "WHERE wan_name = ? AND ts < ? ORDER BY ts DESC LIMIT 1",
            (wan, earliest_ts),
        )
        prev = await cur.fetchone()
        initial_state = int(prev["new_status"]) if prev else 1

        cur = await db.execute(
            "SELECT ts, new_status FROM wan_status_changes "
            "WHERE wan_name = ? AND ts >= ? ORDER BY ts ASC",
            (wan, earliest_ts),
        )
        changes = [dict(r) for r in await cur.fetchall()]

    # Build absolute UP/DOWN spans across the window.
    spans: list[tuple[int, int, int]] = []
    cursor_ts = earliest_ts
    cursor_state = initial_state
    for c in changes:
        c_ts = int(c["ts"])
        c_state = int(c["new_status"])
        if c_state != cursor_state and c_ts > cursor_ts:
            spans.append((cursor_ts, c_ts, cursor_state))
            cursor_ts = c_ts
            cursor_state = c_state
    # If the final span is DOWN and reaches `now`, sanity-check against actual
    # traffic/link state and close it early when the USG missed emitting ALIVE.
    if cursor_state == 0:
        recovery_ts = await _first_recovery_signal_after(wan, cursor_ts)
        if recovery_ts is not None and recovery_ts < now:
            spans.append((cursor_ts, recovery_ts, 0))
            spans.append((recovery_ts, now, 1))
        else:
            spans.append((cursor_ts, now, cursor_state))
    else:
        spans.append((cursor_ts, now, cursor_state))

    out: list[dict] = []
    for i in range(days + 1):
        day_start_dt = earliest_day_start + timedelta(days=i)
        day_end_dt = day_start_dt + timedelta(days=1)
        day_start_ts = int(day_start_dt.timestamp())
        day_end_ts = min(int(day_end_dt.timestamp()), now)
        if day_end_ts <= day_start_ts:
            continue
        day_seconds = day_end_ts - day_start_ts
        down_seconds = 0
        for s_ts, e_ts, st in spans:
            if st != 0:
                continue
            overlap_start = max(s_ts, day_start_ts)
            overlap_end = min(e_ts, day_end_ts)
            if overlap_end > overlap_start:
                down_seconds += overlap_end - overlap_start
        uptime_pct = max(0.0, min(100.0, (1 - down_seconds / day_seconds) * 100))
        out.append({
            "day_ts": day_start_ts,
            "uptime_pct": uptime_pct,
            "down_seconds": down_seconds,
            "samples": day_seconds,
        })
    return out


async def _first_recovery_signal_after(wan: str, after_ts: int) -> int | None:
    """Best estimate of when the WAN came back up after a DEAD event.

    Tries two signals, in order of strength:

    1. First wan_metrics sample with non-zero traffic — strong evidence that
       the WAN is actually carrying packets again. Preferred when available.

    2. First wan_metrics sample with `oper_status = 1` after a longer grace —
       weak signal used for idle/backup WANs where traffic stays at zero for
       hours but the link is physically up. This kicks in when the USG fails
       to emit the closing ALIVE (lost UDP, syslog config, etc.) and the WAN
       is too quiet to ever show `bps > 0`.

    The two-stage check is what keeps short real outages from getting
    swallowed (a 2-min real outage will rarely have `bps > 0` in those 2 min)
    while still recovering from zombie ongoing outages on idle WANs.
    """
    grace_traffic_s = 30
    grace_link_s = 5 * 60  # 5 min — long enough that a real short outage isn't masked
    async with get_db() as db:
        cur = await db.execute(
            "SELECT ts FROM wan_metrics WHERE wan_name = ? AND ts > ? "
            "AND (COALESCE(bps_in,0) + COALESCE(bps_out,0)) > 0 "
            "ORDER BY ts ASC LIMIT 1",
            (wan, after_ts + grace_traffic_s),
        )
        row = await cur.fetchone()
        if row:
            return int(row["ts"])
        cur = await db.execute(
            "SELECT ts FROM wan_metrics WHERE wan_name = ? AND ts > ? "
            "AND oper_status = 1 ORDER BY ts ASC LIMIT 1",
            (wan, after_ts + grace_link_s),
        )
        row = await cur.fetchone()
        return int(row["ts"]) if row else None


async def get_downtime_intervals(wan: str, range_s: int) -> list[dict]:
    """Return DOWN intervals in the range with explicit ongoing flag.

    Handles edge cases:
    - WAN was already DOWN before the range started → emit interval starting at `since`.
    - WAN is currently DOWN per syslog (no closing ALIVE) → before emitting ongoing=True,
      check wan_metrics for actual traffic. If traffic has resumed since the DEAD event,
      close the interval at the first traffic sample and flag `inferred_recovery: True`.
      This catches the common case where the USG fails to emit the ALIVE event after a
      blip (UDP loss, syslog config, etc.) while the link is in fact healthy.
    - WAN has no events in the range → check last known state before the range.
    """
    now = int(time.time())
    since = now - range_s

    async with get_db() as db:
        cur = await db.execute(
            "SELECT new_status FROM wan_status_changes "
            "WHERE wan_name = ? AND ts < ? ORDER BY ts DESC LIMIT 1",
            (wan, since),
        )
        prev = await cur.fetchone()
        initial_down = bool(prev and int(prev["new_status"]) == 0)

        cur = await db.execute(
            "SELECT ts, new_status FROM wan_status_changes "
            "WHERE wan_name = ? AND ts >= ? ORDER BY ts ASC",
            (wan, since),
        )
        rows = [dict(r) for r in await cur.fetchall()]

    intervals: list[dict] = []
    open_start: int | None = since if initial_down else None
    for r in rows:
        new_status = int(r["new_status"])
        ts = int(r["ts"])
        if new_status == 0 and open_start is None:
            open_start = ts
        elif new_status == 1 and open_start is not None:
            intervals.append({
                "start_ts": open_start,
                "end_ts": ts,
                "duration_s": ts - open_start,
                "ongoing": False,
                "inferred_recovery": False,
            })
            open_start = None
    if open_start is not None:
        recovery_ts = await _first_recovery_signal_after(wan, open_start)
        if recovery_ts is not None:
            intervals.append({
                "start_ts": open_start,
                "end_ts": recovery_ts,
                "duration_s": recovery_ts - open_start,
                "ongoing": False,
                "inferred_recovery": True,
            })
        else:
            intervals.append({
                "start_ts": open_start,
                "end_ts": now,
                "duration_s": now - open_start,
                "ongoing": True,
                "inferred_recovery": False,
            })
    return intervals
