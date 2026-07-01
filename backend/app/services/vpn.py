"""Service layer for VPN data (site-to-site tunnels + client sessions)."""
import ipaddress
import time

from ..cache.database import get_db
from ..config import settings


def _cidr_to_like_prefix(cidr: str | None) -> str | None:
    """Translate an IPv4 CIDR into a SQL LIKE prefix for fast sqlite filtering.

    Supports /24, /16, /8 directly via prefix LIKE. Returns None for other masks
    so the caller can skip the tunnel or fall back to in-memory filtering.
    """
    if not cidr:
        return None
    try:
        net = ipaddress.IPv4Network(cidr, strict=False)
    except (ValueError, TypeError):
        return None
    a, b, c, _ = str(net.network_address).split(".")
    if net.prefixlen == 24:
        return f"{a}.{b}.{c}.%"
    if net.prefixlen == 16:
        return f"{a}.{b}.%"
    if net.prefixlen == 8:
        return f"{a}.%"
    return None


async def list_tunnels(only_state: str | None = None) -> list[dict]:
    sql = (
        "SELECT name, peer_ip, local_ip, state, last_event_msg, last_event_ts, "
        "last_dpd_ts, dpd_count, rekeys, first_seen, last_seen FROM vpn_tunnels"
    )
    params: list = []
    if only_state:
        sql += " WHERE state = ?"
        params.append(only_state)
    sql += " ORDER BY last_seen DESC"
    async with get_db() as db:
        cur = await db.execute(sql, params)
        rows = await cur.fetchall()
        now = int(time.time())
        out: list[dict] = []
        for r in rows:
            d = dict(r)
            # Derived: if no event in 300s and no DPD in 300s, mark stale
            last_seen = d.get("last_seen") or 0
            last_dpd = d.get("last_dpd_ts") or 0
            age = now - max(last_seen, last_dpd)
            d["age_sec"] = age
            if d.get("state") == "UP" and age > 300:
                d["health"] = "stale"
            elif d.get("state") == "DOWN":
                d["health"] = "down"
            elif d.get("state") == "UP":
                d["health"] = "healthy"
            else:
                d["health"] = "unknown"
            out.append(d)
        return out


async def tunnel_summary() -> dict:
    tunnels = await list_tunnels()
    return {
        "total": len(tunnels),
        "up": sum(1 for t in tunnels if t["health"] == "healthy"),
        "stale": sum(1 for t in tunnels if t["health"] == "stale"),
        "down": sum(1 for t in tunnels if t["health"] == "down"),
        "unknown": sum(1 for t in tunnels if t["health"] == "unknown"),
    }


async def list_client_sessions(active_only: bool = False, limit: int = 200) -> list[dict]:
    sql = (
        "SELECT id, username, src_ip, assigned_ip, vpn_type, "
        "started_at, ended_at, last_seen_ts FROM vpn_client_sessions"
    )
    if active_only:
        sql += " WHERE ended_at IS NULL"
    sql += " ORDER BY started_at DESC LIMIT ?"
    async with get_db() as db:
        cur = await db.execute(sql, (limit,))
        rows = await cur.fetchall()
        now = int(time.time())
        out: list[dict] = []
        for r in rows:
            d = dict(r)
            start = d.get("started_at") or now
            end = d.get("ended_at") or now
            d["duration_sec"] = max(0, end - start)
            d["active"] = d.get("ended_at") is None
            out.append(d)
        return out


async def client_summary() -> dict:
    async with get_db() as db:
        cur = await db.execute(
            "SELECT COUNT(*) AS n FROM vpn_client_sessions WHERE ended_at IS NULL"
        )
        active = (await cur.fetchone())["n"]
        cur = await db.execute(
            "SELECT COUNT(*) AS n FROM vpn_client_sessions WHERE started_at >= ?",
            (int(time.time()) - 86400,),
        )
        last_24h = (await cur.fetchone())["n"]
    return {"active": active, "last_24h": last_24h}


async def vpn_events_recent(limit: int = 100) -> list[dict]:
    """Recent IPSec VPN syslog lines (from existing events table)."""
    limit = max(1, min(limit, 500))
    async with get_db() as db:
        cur = await db.execute(
            "SELECT id, ts, priority, message, src_ip, dst_ip, action, note "
            "FROM events WHERE category = 'IPSec VPN' ORDER BY ts DESC LIMIT ?",
            (limit,),
        )
        return [dict(r) for r in await cur.fetchall()]


async def tunnel_uptime(tunnel_name: str, range_s: int) -> dict:
    """Estimate uptime % for a tunnel from DPD/event density in 5-min buckets."""
    now = int(time.time())
    since = now - range_s
    bucket_s = 300

    async with get_db() as db:
        cur = await db.execute(
            "SELECT ts FROM events WHERE category = 'IPSec VPN' AND ts >= ? "
            "AND message LIKE ?",
            (since, f"%{tunnel_name}%"),
        )
        ts_list = [int(r["ts"]) for r in await cur.fetchall()]

    total_buckets = max(1, range_s // bucket_s)
    if not ts_list:
        return {"tunnel": tunnel_name, "uptime_pct": 0.0,
                "alive_buckets": 0, "total_buckets": total_buckets, "samples": 0}
    alive_buckets = len({(t // bucket_s) for t in ts_list})
    uptime_pct = min(100.0, alive_buckets / total_buckets * 100)
    return {
        "tunnel": tunnel_name, "uptime_pct": uptime_pct,
        "alive_buckets": alive_buckets, "total_buckets": total_buckets,
        "samples": len(ts_list),
    }


async def all_tunnels_uptime(range_s: int) -> list[dict]:
    tunnels = await list_tunnels()
    out: list[dict] = []
    for t in tunnels:
        u = await tunnel_uptime(t["name"], range_s)
        u["state"] = t.get("state")
        u["peer_ip"] = t.get("peer_ip")
        u["last_dpd_ts"] = t.get("last_dpd_ts")
        out.append(u)
    return sorted(out, key=lambda x: x["uptime_pct"], reverse=True)


async def tunnel_traffic(range_s: int) -> list[dict]:
    """Bytes per tunnel by matching flow_aggregates with each tunnel's remote LAN subnet.

    The correlation uses VPN_REMOTE_SUBNETS (tunnel_name -> CIDR) because
    flow_aggregates stores internal IPs, not the peer public WAN IPs.
    Tunnels without a configured remote subnet return 0 bytes and a flag so
    the UI can prompt for configuration.
    """
    tunnels = await list_tunnels()
    if not tunnels:
        return []
    subnets = settings.vpn_remote_subnets_map
    since = int(time.time()) - range_s
    out: list[dict] = []
    async with get_db() as db:
        for t in tunnels:
            name = t["name"]
            cidr = subnets.get(name)
            prefix = _cidr_to_like_prefix(cidr)
            bytes_in = 0
            bytes_out = 0
            if prefix:
                cur = await db.execute(
                    "SELECT "
                    "  COALESCE(SUM(CASE WHEN src_ip LIKE ? THEN bytes ELSE 0 END), 0) AS bytes_in, "
                    "  COALESCE(SUM(CASE WHEN dst_ip LIKE ? THEN bytes ELSE 0 END), 0) AS bytes_out "
                    "FROM flow_aggregates WHERE ts_bucket >= ?",
                    (prefix, prefix, since),
                )
                row = await cur.fetchone()
                bytes_in = int(row["bytes_in"] or 0)
                bytes_out = int(row["bytes_out"] or 0)
            out.append({
                "tunnel": name,
                "peer_ip": t.get("peer_ip"),
                "remote_subnet": cidr,
                "configured": bool(prefix),
                "bytes_in": bytes_in,
                "bytes_out": bytes_out,
                "bytes_total": bytes_in + bytes_out,
                "state": t.get("state"),
            })
    return sorted(out, key=lambda x: (x["configured"], x["bytes_total"]), reverse=True)


async def tunnel_usage_heatmap(tunnel_name: str, range_s: int) -> dict:
    """Bytes by (weekday, hour) for one tunnel, matched against its remote subnet."""
    cidr = settings.vpn_remote_subnets_map.get(tunnel_name)
    prefix = _cidr_to_like_prefix(cidr)
    if not prefix:
        return {"data": [], "configured": False, "remote_subnet": cidr}
    since = int(time.time()) - range_s
    async with get_db() as db:
        cur = await db.execute(
            """
            SELECT
                CAST(strftime('%w', ts_bucket, 'unixepoch', 'localtime') AS INTEGER) AS dow,
                CAST(strftime('%H', ts_bucket, 'unixepoch', 'localtime') AS INTEGER) AS hour,
                COALESCE(SUM(bytes), 0) AS bytes_total,
                COUNT(*) AS samples
            FROM flow_aggregates
            WHERE ts_bucket >= ? AND (src_ip LIKE ? OR dst_ip LIKE ?)
            GROUP BY dow, hour
            ORDER BY dow, hour
            """,
            (since, prefix, prefix),
        )
        rows = [dict(r) for r in await cur.fetchall()]
    return {
        "data": rows,
        "configured": True,
        "remote_subnet": cidr,
        "tunnel": tunnel_name,
    }


async def tunnels_daily_heatmap(range_s: int) -> dict:
    """Daily bytes per tunnel, suitable for a (tunnel × day) heatmap.

    Returns rows for every configured tunnel × every day in range, including
    empty days as bytes=0 so the heatmap stays rectangular.
    """
    subnets = settings.vpn_remote_subnets_map
    if not subnets:
        return {"data": [], "tunnels": [], "days": [], "configured_count": 0}

    now = int(time.time())
    since = now - range_s
    day_s = 86400
    # Align "since" to midnight local boundary to avoid half-empty leading column
    day_start = (since // day_s) * day_s
    days: list[int] = []
    t = day_start
    while t <= now:
        days.append(t)
        t += day_s

    rows: list[dict] = []
    tunnel_totals: dict[str, int] = {}
    async with get_db() as db:
        for tunnel_name, cidr in subnets.items():
            prefix = _cidr_to_like_prefix(cidr)
            if not prefix:
                continue
            cur = await db.execute(
                """
                SELECT
                    (ts_bucket / 86400) * 86400 AS day_ts,
                    COALESCE(SUM(bytes), 0) AS bytes_total
                FROM flow_aggregates
                WHERE ts_bucket >= ? AND (src_ip LIKE ? OR dst_ip LIKE ?)
                GROUP BY day_ts
                ORDER BY day_ts ASC
                """,
                (day_start, prefix, prefix),
            )
            by_day = {int(r["day_ts"]): int(r["bytes_total"] or 0) for r in await cur.fetchall()}
            total = 0
            for d in days:
                bytes_total = by_day.get(d, 0)
                total += bytes_total
                rows.append({"tunnel": tunnel_name, "day_ts": d, "bytes_total": bytes_total})
            tunnel_totals[tunnel_name] = total

    tunnels_ranked = sorted(tunnel_totals.items(), key=lambda x: x[1], reverse=True)
    return {
        "data": rows,
        "tunnels": [{"name": n, "bytes_total": b} for n, b in tunnels_ranked],
        "days": days,
        "configured_count": len(tunnel_totals),
    }


async def tunnels_with_geo() -> list[dict]:
    """Tunnels enriched with GeoIP of their peer_ip — for the branches map."""
    from . import geoip as geoip_svc
    tunnels = await list_tunnels()
    if not tunnels:
        return []
    peer_ips = [t["peer_ip"] for t in tunnels if t.get("peer_ip")]
    geo = await geoip_svc.lookup_many(peer_ips)
    out: list[dict] = []
    for t in tunnels:
        g = geo.get(t.get("peer_ip") or "")
        if g and g.get("lat") is not None:
            t = dict(t)
            t["country"] = g.get("country")
            t["country_code"] = g.get("country_code")
            t["city"] = g.get("city")
            t["lat"] = g.get("lat")
            t["lon"] = g.get("lon")
            t["isp"] = g.get("isp")
            out.append(t)
        else:
            t = dict(t)
            t["lat"] = None
            t["lon"] = None
            out.append(t)
    return out
