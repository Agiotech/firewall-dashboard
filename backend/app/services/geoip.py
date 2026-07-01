"""GeoIP lookup using ip-api.com free tier (45 req/min single, 15 req/min batch).

Aggressively cached in SQLite. Private IPs are skipped (returned as None).
"""
import asyncio
import ipaddress
import logging
import time

import httpx

from ..cache import database as db

log = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 7 * 86400
_API_BASE = "http://ip-api.com"
_BATCH_SIZE = 100
_FIELDS = "status,country,countryCode,regionName,city,lat,lon,isp,org,as,query"


def _is_public(ip: str) -> bool:
    try:
        a = ipaddress.ip_address(ip)
        return not (a.is_private or a.is_loopback or a.is_link_local
                    or a.is_multicast or a.is_unspecified or a.is_reserved)
    except ValueError:
        return False


async def lookup(ip: str) -> dict | None:
    if not _is_public(ip):
        return None
    now = int(time.time())
    cached = await db.get_geoip(ip)
    if cached and now - (cached.get("cached_at") or 0) < CACHE_TTL_SECONDS:
        return cached
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(f"{_API_BASE}/json/{ip}", params={"fields": _FIELDS})
            data = r.json()
            if data.get("status") == "success":
                await db.upsert_geoip(ip, data, now)
                return await db.get_geoip(ip)
    except Exception as e:
        log.debug("geoip lookup %s failed: %s", ip, e)
    return cached


async def lookup_many(ips: list[str]) -> dict[str, dict]:
    """Resolve as many IPs as possible. Uses /batch endpoint when >5 missing."""
    if not ips:
        return {}
    unique = list({ip for ip in ips if _is_public(ip)})
    cached = await db.get_geoip_bulk(unique)
    now = int(time.time())

    fresh: dict[str, dict] = {ip: row for ip, row in cached.items()
                              if now - (row.get("cached_at") or 0) < CACHE_TTL_SECONDS}
    missing = [ip for ip in unique if ip not in fresh]

    if not missing:
        return fresh

    # Batch fetch (max 100 per call)
    for chunk_start in range(0, len(missing), _BATCH_SIZE):
        chunk = missing[chunk_start:chunk_start + _BATCH_SIZE]
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(
                    f"{_API_BASE}/batch?fields={_FIELDS}",
                    json=[{"query": ip} for ip in chunk],
                )
                data = resp.json()
                if not isinstance(data, list):
                    continue
                for entry in data:
                    if entry.get("status") == "success":
                        ip = entry.get("query")
                        if ip:
                            await db.upsert_geoip(ip, entry, now)
        except Exception as e:
            log.debug("geoip batch failed: %s", e)
            break
        # Throttle a bit between batches (ip-api: 15 req/min for batch)
        if chunk_start + _BATCH_SIZE < len(missing):
            await asyncio.sleep(0.6)

    # Re-pull all from cache (including fresh ones just inserted)
    return await db.get_geoip_bulk(unique)


async def aggregate_external_traffic(range_s: int, top_n: int = 30) -> list[dict]:
    """Top external IPs by bytes in window, enriched with GeoIP (country/lat/lon)."""
    from ..cache.database import get_db
    since = int(time.time()) - range_s
    sql = """
        WITH ips AS (
            SELECT src_ip AS ip, SUM(bytes) AS bytes FROM flow_aggregates
            WHERE ts_bucket >= ?
              AND NOT (src_ip LIKE '10.%' OR src_ip LIKE '192.168.%' OR src_ip LIKE '172.16.%'
                       OR src_ip LIKE '172.17.%' OR src_ip LIKE '172.18.%' OR src_ip LIKE '172.19.%'
                       OR src_ip LIKE '172.2_.%' OR src_ip LIKE '172.3_.%' OR src_ip = '127.0.0.1'
                       OR src_ip LIKE '169.254.%')
            GROUP BY src_ip
            UNION ALL
            SELECT dst_ip AS ip, SUM(bytes) AS bytes FROM flow_aggregates
            WHERE ts_bucket >= ?
              AND NOT (dst_ip LIKE '10.%' OR dst_ip LIKE '192.168.%' OR dst_ip LIKE '172.16.%'
                       OR dst_ip LIKE '172.17.%' OR dst_ip LIKE '172.18.%' OR dst_ip LIKE '172.19.%'
                       OR dst_ip LIKE '172.2_.%' OR dst_ip LIKE '172.3_.%' OR dst_ip = '127.0.0.1'
                       OR dst_ip LIKE '169.254.%')
            GROUP BY dst_ip
        )
        SELECT ip, SUM(bytes) AS bytes FROM ips GROUP BY ip ORDER BY bytes DESC LIMIT ?
    """
    async with get_db() as conn:
        cur = await conn.execute(sql, (since, since, top_n))
        rows = [dict(r) for r in await cur.fetchall()]

    if not rows:
        return []

    geo = await lookup_many([r["ip"] for r in rows])
    enriched: list[dict] = []
    for r in rows:
        g = geo.get(r["ip"])
        if g and g.get("lat") is not None:
            enriched.append({
                "ip": r["ip"],
                "bytes": r["bytes"],
                "country": g.get("country"),
                "country_code": g.get("country_code"),
                "city": g.get("city"),
                "lat": g.get("lat"),
                "lon": g.get("lon"),
                "isp": g.get("isp"),
            })
    return enriched


async def aggregate_by_country(range_s: int) -> list[dict]:
    """Sum bytes grouped by country (external endpoints only)."""
    rows = await aggregate_external_traffic(range_s, top_n=500)
    by_country: dict[str, dict] = {}
    for r in rows:
        cc = r.get("country_code") or "??"
        bucket = by_country.setdefault(cc, {
            "country_code": cc, "country": r.get("country"), "bytes": 0,
            "ip_count": 0, "lat": r.get("lat"), "lon": r.get("lon"),
        })
        bucket["bytes"] += int(r.get("bytes") or 0)
        bucket["ip_count"] += 1
    return sorted(by_country.values(), key=lambda x: x["bytes"], reverse=True)
