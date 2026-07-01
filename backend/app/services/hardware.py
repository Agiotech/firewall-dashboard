"""Hardware metrics (temperature, fans, PSU) — best effort against Zyxel proprietary OIDs.

Strategy:
1. Try a handful of well-known Zyxel uOS OIDs (best-guess for FLEX 700H).
2. If timeouts or no value, skip gracefully — section degrades to "no data".
3. Persist whatever does respond into hardware_metrics for trend display.
"""
import logging
import time

from ..cache.database import get_db
from ..cache import database as db
from ..snmp.client import SnmpReadError, snmp_get

log = logging.getLogger(__name__)


# Candidate Zyxel OIDs (the actual ones for FLEX 700H may differ — best effort).
# If none of these respond, the hardware section will be empty. That's OK.
CANDIDATE_OIDS = [
    ("temp", "cpu", "1.3.6.1.4.1.890.1.15.3.27.1.1.1.0"),
    ("temp", "cpu", "1.3.6.1.4.1.890.1.5.13.7.1.1.0"),
    ("temp", "system", "1.3.6.1.4.1.890.1.15.3.27.1.2.1.0"),
    ("fan", "fan1", "1.3.6.1.4.1.890.1.15.3.27.2.1.1.0"),
    ("fan", "fan2", "1.3.6.1.4.1.890.1.15.3.27.2.1.2.0"),
    ("psu", "psu1", "1.3.6.1.4.1.890.1.15.3.27.3.1.1.0"),
]


async def poll_hardware() -> dict:
    """Try each candidate OID once and persist anything that returns a numeric value."""
    now = int(time.time())
    persisted: list[dict] = []
    for kind, name, oid in CANDIDATE_OIDS:
        try:
            r = await snmp_get([oid])
        except SnmpReadError:
            continue
        except Exception:
            continue
        if not r:
            continue
        val = r.get(oid)
        if isinstance(val, (int, float)):
            unit = {"temp": "C", "fan": "rpm", "psu": "W"}.get(kind)
            await db.insert_hardware_metric(now, kind, name, float(val), unit)
            persisted.append({"kind": kind, "name": name, "value": float(val), "unit": unit})
    return {"persisted": persisted, "ts": now}


async def latest_hardware() -> list[dict]:
    """Latest reading per (kind, name)."""
    async with get_db() as conn:
        cur = await conn.execute("""
            SELECT h.ts, h.kind, h.name, h.value, h.unit
            FROM hardware_metrics h
            INNER JOIN (
                SELECT kind, name, MAX(ts) AS max_ts FROM hardware_metrics GROUP BY kind, name
            ) latest ON h.kind = latest.kind AND h.name = latest.name AND h.ts = latest.max_ts
        """)
        return [dict(r) for r in await cur.fetchall()]


async def hardware_series(kind: str, name: str, range_s: int) -> list[dict]:
    since = int(time.time()) - range_s
    async with get_db() as conn:
        cur = await conn.execute(
            "SELECT ts, value FROM hardware_metrics "
            "WHERE kind = ? AND name = ? AND ts >= ? ORDER BY ts ASC",
            (kind, name, since),
        )
        return [dict(r) for r in await cur.fetchall()]
