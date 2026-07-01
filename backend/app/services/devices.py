"""Service layer: read devices + derive per-device traffic from flow_aggregates."""
import time

from ..cache.database import get_db


async def list_devices(only_type: str | None = None, limit: int = 500) -> list[dict]:
    sql = (
        "SELECT ip, mac, vendor, hostname, sys_descr, device_type, snmp_ok, "
        "first_seen, last_seen, if_index_fw FROM devices"
    )
    params: list = []
    if only_type:
        sql += " WHERE device_type = ?"
        params.append(only_type)
    sql += " ORDER BY last_seen DESC LIMIT ?"
    params.append(limit)
    async with get_db() as db:
        cur = await db.execute(sql, params)
        return [dict(r) for r in await cur.fetchall()]


async def device_summary() -> dict:
    async with get_db() as db:
        cur = await db.execute("SELECT COUNT(*) AS n FROM devices")
        total = (await cur.fetchone())["n"]
        cur = await db.execute(
            "SELECT device_type, COUNT(*) AS n FROM devices GROUP BY device_type"
        )
        by_type = {r["device_type"] or "unknown": r["n"] for r in await cur.fetchall()}
        cur = await db.execute("SELECT COUNT(*) AS n FROM devices WHERE snmp_ok = 1")
        snmp_ok = (await cur.fetchone())["n"]
    return {"total": total, "by_type": by_type, "snmp_ok": snmp_ok}


async def device_traffic_top(range_s: int, limit: int = 50) -> list[dict]:
    """Top devices by total bytes (sent + received) within the window."""
    since = int(time.time()) - range_s
    sql = """
        WITH outbound AS (
            SELECT src_ip AS ip, SUM(bytes) AS bytes_out, SUM(packets) AS pkts_out
            FROM flow_aggregates
            WHERE ts_bucket >= ?
            GROUP BY src_ip
        ),
        inbound AS (
            SELECT dst_ip AS ip, SUM(bytes) AS bytes_in, SUM(packets) AS pkts_in
            FROM flow_aggregates
            WHERE ts_bucket >= ?
            GROUP BY dst_ip
        )
        SELECT
            COALESCE(o.ip, i.ip) AS ip,
            COALESCE(i.bytes_in, 0) AS bytes_in,
            COALESCE(o.bytes_out, 0) AS bytes_out,
            COALESCE(i.bytes_in, 0) + COALESCE(o.bytes_out, 0) AS bytes_total,
            COALESCE(i.pkts_in, 0) + COALESCE(o.pkts_out, 0) AS pkts_total
        FROM outbound o
        FULL OUTER JOIN inbound i ON o.ip = i.ip
        ORDER BY bytes_total DESC
        LIMIT ?
    """
    # SQLite doesn't support FULL OUTER JOIN — emulate with UNION + LEFT JOINs
    sql_compat = """
        WITH base AS (
            SELECT ip FROM (
                SELECT src_ip AS ip FROM flow_aggregates WHERE ts_bucket >= ?
                UNION
                SELECT dst_ip AS ip FROM flow_aggregates WHERE ts_bucket >= ?
            )
            GROUP BY ip
        )
        SELECT
            b.ip,
            COALESCE((SELECT SUM(bytes) FROM flow_aggregates WHERE dst_ip = b.ip AND ts_bucket >= ?), 0) AS bytes_in,
            COALESCE((SELECT SUM(bytes) FROM flow_aggregates WHERE src_ip = b.ip AND ts_bucket >= ?), 0) AS bytes_out
        FROM base b
        ORDER BY (bytes_in + bytes_out) DESC
        LIMIT ?
    """
    _ = sql  # silence linter
    async with get_db() as db:
        cur = await db.execute(sql_compat, (since, since, since, since, limit))
        rows = await cur.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["bytes_total"] = d["bytes_in"] + d["bytes_out"]
            result.append(d)
        return result


async def traffic_for_ips(ips: list[str], range_s: int) -> dict[str, dict]:
    """Return {ip: {bytes_in, bytes_out}} for the given IPs within the window.

    bytes_in  = bytes received by the host (host is dst_ip) -> download.
    bytes_out = bytes sent by the host (host is src_ip)      -> upload.
    """
    if not ips:
        return {}
    since = int(time.time()) - range_s
    placeholders = ",".join("?" for _ in ips)
    out: dict[str, dict] = {ip: {"bytes_in": 0, "bytes_out": 0} for ip in ips}
    async with get_db() as db:
        cur = await db.execute(
            f"SELECT dst_ip AS ip, SUM(bytes) AS b FROM flow_aggregates "
            f"WHERE ts_bucket >= ? AND dst_ip IN ({placeholders}) GROUP BY dst_ip",
            (since, *ips),
        )
        for r in await cur.fetchall():
            out[r["ip"]]["bytes_in"] = r["b"] or 0
        cur = await db.execute(
            f"SELECT src_ip AS ip, SUM(bytes) AS b FROM flow_aggregates "
            f"WHERE ts_bucket >= ? AND src_ip IN ({placeholders}) GROUP BY src_ip",
            (since, *ips),
        )
        for r in await cur.fetchall():
            out[r["ip"]]["bytes_out"] = r["b"] or 0
    return out


async def device_traffic_series(ip: str, range_s: int, bucket_s: int = 60) -> list[dict]:
    """Time series of bytes in/out for a single device, bucketed by `bucket_s` seconds."""
    since = int(time.time()) - range_s
    bucket = max(60, bucket_s)
    async with get_db() as db:
        cur = await db.execute(
            f"""
            SELECT
                (ts_bucket / {bucket}) * {bucket} AS bucket_ts,
                SUM(CASE WHEN dst_ip = ? THEN bytes ELSE 0 END) AS bytes_in,
                SUM(CASE WHEN src_ip = ? THEN bytes ELSE 0 END) AS bytes_out
            FROM flow_aggregates
            WHERE ts_bucket >= ? AND (src_ip = ? OR dst_ip = ?)
            GROUP BY bucket_ts
            ORDER BY bucket_ts ASC
            """,
            (ip, ip, since, ip, ip),
        )
        rows = await cur.fetchall()
        return [
            {
                "ts": r["bucket_ts"],
                "bytes_in": r["bytes_in"] or 0,
                "bytes_out": r["bytes_out"] or 0,
                "bps_in": (r["bytes_in"] or 0) * 8 / bucket,
                "bps_out": (r["bytes_out"] or 0) * 8 / bucket,
            }
            for r in rows
        ]


async def list_new_devices(days: int = 7, limit: int = 100) -> list[dict]:
    cutoff = int(time.time()) - days * 86400
    async with get_db() as db:
        cur = await db.execute(
            "SELECT ip, mac, vendor, hostname, sys_descr, device_type, snmp_ok, "
            "first_seen, last_seen, if_index_fw "
            "FROM devices WHERE first_seen >= ? ORDER BY first_seen DESC LIMIT ?",
            (cutoff, limit),
        )
        return [dict(r) for r in await cur.fetchall()]


async def vendor_distribution() -> list[dict]:
    async with get_db() as db:
        cur = await db.execute(
            "SELECT COALESCE(vendor, 'Unknown') AS vendor, COUNT(*) AS n "
            "FROM devices GROUP BY vendor ORDER BY n DESC"
        )
        return [dict(r) for r in await cur.fetchall()]


async def device_top_destinations(ip: str, range_s: int, limit: int = 10) -> dict:
    """Top external destinations a device talked to + bytes."""
    since = int(time.time()) - range_s
    async with get_db() as db:
        # As source: where this device sent data
        cur = await db.execute(
            "SELECT dst_ip AS peer, SUM(bytes) AS bytes_out FROM flow_aggregates "
            "WHERE src_ip = ? AND ts_bucket >= ? GROUP BY dst_ip "
            "ORDER BY bytes_out DESC LIMIT ?",
            (ip, since, limit),
        )
        out = [dict(r) for r in await cur.fetchall()]
        # As destination: where this device received from
        cur = await db.execute(
            "SELECT src_ip AS peer, SUM(bytes) AS bytes_in FROM flow_aggregates "
            "WHERE dst_ip = ? AND ts_bucket >= ? GROUP BY src_ip "
            "ORDER BY bytes_in DESC LIMIT ?",
            (ip, since, limit),
        )
        in_ = [dict(r) for r in await cur.fetchall()]
        # Top ports the device hit (as src)
        cur = await db.execute(
            "SELECT e.dst_port, COUNT(*) AS n FROM events e "
            "WHERE e.src_ip = ? AND e.ts >= ? AND e.dst_port IS NOT NULL "
            "GROUP BY e.dst_port ORDER BY n DESC LIMIT ?",
            (ip, since, limit),
        )
        ports = [dict(r) for r in await cur.fetchall()]
    return {"top_dst": out, "top_src": in_, "top_ports": ports}


async def device_events(ip: str, range_s: int, limit: int = 50) -> list[dict]:
    since = int(time.time()) - range_s
    async with get_db() as db:
        cur = await db.execute(
            "SELECT id, ts, priority, category, message, src_ip, src_port, dst_ip, dst_port, action, note "
            "FROM events WHERE ts >= ? AND (src_ip = ? OR dst_ip = ?) ORDER BY ts DESC LIMIT ?",
            (since, ip, ip, limit),
        )
        return [dict(r) for r in await cur.fetchall()]


async def top_peers_for_ip(ip: str, range_s: int, limit: int = 5) -> list[dict]:
    """Return top counterparty IPs that exchanged bytes with `ip` in the window.

    Useful to enrich high-traffic alerts: when an external IP alarms, this tells
    us which local hosts are talking to it (and vice-versa).
    """
    since = int(time.time()) - range_s
    sql = """
        WITH peers AS (
            SELECT
                CASE WHEN src_ip = ? THEN dst_ip ELSE src_ip END AS peer,
                bytes,
                packets
            FROM flow_aggregates
            WHERE ts_bucket >= ? AND (src_ip = ? OR dst_ip = ?)
        )
        SELECT peer AS ip,
               SUM(bytes) AS total_bytes,
               SUM(packets) AS total_packets
        FROM peers
        GROUP BY peer
        ORDER BY total_bytes DESC
        LIMIT ?
    """
    async with get_db() as db:
        cur = await db.execute(sql, (ip, since, ip, ip, limit))
        return [dict(r) for r in await cur.fetchall()]


async def device_metrics_series(ip: str, range_s: int) -> list[dict]:
    since = int(time.time()) - range_s
    async with get_db() as db:
        cur = await db.execute(
            "SELECT ts, cpu_pct, mem_pct, uptime_sec FROM device_metrics "
            "WHERE ip = ? AND ts >= ? ORDER BY ts ASC",
            (ip, since),
        )
        return [dict(r) for r in await cur.fetchall()]
