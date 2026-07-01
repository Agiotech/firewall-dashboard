import ipaddress
import time

from ..cache.database import get_db


RANGE_MAP = {
    "5m": 300,
    "1h": 3600,
    "6h": 21600,
    "24h": 86400,
    "7d": 604800,
}


def parse_range(r: str) -> int:
    return RANGE_MAP.get(r, 3600)


def _is_private(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
        return addr.is_private or addr.is_loopback or addr.is_link_local
    except ValueError:
        return False


def _private_subquery(column: str, private: bool) -> str:
    """SQLite hack: list common RFC1918 prefixes."""
    op = "" if private else "NOT "
    return (
        f"({op}({column} LIKE '10.%' "
        f"OR {column} LIKE '192.168.%' "
        f"OR {column} LIKE '172.16.%' OR {column} LIKE '172.17.%' "
        f"OR {column} LIKE '172.18.%' OR {column} LIKE '172.19.%' "
        f"OR {column} LIKE '172.20.%' OR {column} LIKE '172.21.%' "
        f"OR {column} LIKE '172.22.%' OR {column} LIKE '172.23.%' "
        f"OR {column} LIKE '172.24.%' OR {column} LIKE '172.25.%' "
        f"OR {column} LIKE '172.26.%' OR {column} LIKE '172.27.%' "
        f"OR {column} LIKE '172.28.%' OR {column} LIKE '172.29.%' "
        f"OR {column} LIKE '172.30.%' OR {column} LIKE '172.31.%' "
        f"OR {column} = '127.0.0.1' OR {column} LIKE '169.254.%'))"
    )


def _cidr_to_like_prefix(cidr: str | None) -> str | None:
    """Translate /24, /16, /8 CIDR into a SQL LIKE prefix. None for other masks."""
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


async def discover_active_private_subnets(range_s: int, limit: int = 15) -> list[dict]:
    """List private /24 subnets that actually appear in flow_aggregates.

    Useful when a user hasn't yet mapped LAN ports to their real CIDRs — they
    can see which subnets have traffic and pick the right one for their port.
    """
    since = int(time.time()) - range_s
    private = _private_subquery("src_ip", True)
    async with get_db() as conn:
        cur = await conn.execute(
            f"""
            SELECT
                substr(src_ip, 1, length(src_ip) - length(replace(src_ip, '.', '')) + length(replace(src_ip, '.', '')))
                AS dummy,
                src_ip,
                SUM(bytes) AS total_bytes
            FROM flow_aggregates
            WHERE ts_bucket >= ? AND {private}
            GROUP BY src_ip
            """,
            (since,),
        )
        ip_totals: dict[str, int] = {}
        for r in await cur.fetchall():
            d = dict(r)
            ip = d["src_ip"]
            ip_totals[ip] = ip_totals.get(ip, 0) + int(d["total_bytes"] or 0)

    subnet_totals: dict[str, dict] = {}
    for ip, total in ip_totals.items():
        parts = ip.split(".")
        if len(parts) != 4:
            continue
        subnet = f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"
        agg = subnet_totals.setdefault(subnet, {"cidr": subnet, "bytes": 0, "hosts": 0})
        agg["bytes"] += total
        agg["hosts"] += 1
    out = sorted(subnet_totals.values(), key=lambda x: x["bytes"], reverse=True)
    return out[:limit]


async def top_hosts_in_subnet(cidr: str, range_s: int, limit: int = 20) -> dict:
    """Top hosts inside a given LAN subnet, split by download/upload bytes.

    Used by the per-port modal: filters flow_aggregates so the host_ip belongs
    to the requested CIDR, then sums separately the bytes received from
    external peers (download) and bytes sent to external peers (upload).
    """
    prefix = _cidr_to_like_prefix(cidr)
    if not prefix:
        return {"download": [], "upload": [], "configured": False, "cidr": cidr}
    since = int(time.time()) - range_s
    not_private_src = _private_subquery("src_ip", False)
    not_private_dst = _private_subquery("dst_ip", False)
    async with get_db() as conn:
        cur = await conn.execute(
            f"""
            SELECT dst_ip AS host, SUM(bytes) AS total_bytes, SUM(packets) AS total_packets
            FROM flow_aggregates
            WHERE ts_bucket >= ? AND dst_ip LIKE ? AND {not_private_src}
            GROUP BY dst_ip ORDER BY total_bytes DESC LIMIT ?
            """,
            (since, prefix, limit),
        )
        download = [dict(r) for r in await cur.fetchall()]
        cur = await conn.execute(
            f"""
            SELECT src_ip AS host, SUM(bytes) AS total_bytes, SUM(packets) AS total_packets
            FROM flow_aggregates
            WHERE ts_bucket >= ? AND src_ip LIKE ? AND {not_private_dst}
            GROUP BY src_ip ORDER BY total_bytes DESC LIMIT ?
            """,
            (since, prefix, limit),
        )
        upload = [dict(r) for r in await cur.fetchall()]
    return {"download": download, "upload": upload, "configured": True, "cidr": cidr}


async def top_lan_hosts(direction: str, range_s: int, limit: int = 20) -> list[dict]:
    """Top internal hosts. direction: 'download' (bytes received) or 'upload' (bytes sent)."""
    since = int(time.time()) - range_s
    if direction == "download":
        # internal host is destination, source is external
        host_col = "dst_ip"
        host_filter = _private_subquery("dst_ip", True)
        peer_filter = _private_subquery("src_ip", False)
    else:
        # upload: internal host is source, destination is external
        host_col = "src_ip"
        host_filter = _private_subquery("src_ip", True)
        peer_filter = _private_subquery("dst_ip", False)

    sql = f"""
        SELECT {host_col} AS host, SUM(bytes) AS total_bytes, SUM(packets) AS total_packets
        FROM flow_aggregates
        WHERE ts_bucket >= ? AND {host_filter} AND {peer_filter}
        GROUP BY {host_col}
        ORDER BY total_bytes DESC
        LIMIT ?
    """
    async with get_db() as conn:
        cur = await conn.execute(sql, (since, limit))
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def top_external_ips(direction: str, range_s: int, limit: int = 20) -> list[dict]:
    """Top external IPs.
    download = external IPs we downloaded FROM (external is src).
    upload   = external IPs we uploaded TO (external is dst).
    """
    since = int(time.time()) - range_s
    if direction == "download":
        host_col = "src_ip"
        host_filter = _private_subquery("src_ip", False)
        peer_filter = _private_subquery("dst_ip", True)
    else:
        host_col = "dst_ip"
        host_filter = _private_subquery("dst_ip", False)
        peer_filter = _private_subquery("src_ip", True)

    sql = f"""
        SELECT {host_col} AS host, SUM(bytes) AS total_bytes, SUM(packets) AS total_packets
        FROM flow_aggregates
        WHERE ts_bucket >= ? AND {host_filter} AND {peer_filter}
        GROUP BY {host_col}
        ORDER BY total_bytes DESC
        LIMIT ?
    """
    async with get_db() as conn:
        cur = await conn.execute(sql, (since, limit))
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def total_bytes(range_s: int) -> dict:
    since = int(time.time()) - range_s
    async with get_db() as conn:
        cur = await conn.execute(
            "SELECT COUNT(*) AS flows, SUM(bytes) AS bytes_, SUM(packets) AS packets "
            "FROM flow_aggregates WHERE ts_bucket >= ?",
            (since,),
        )
        row = await cur.fetchone()
        return dict(row) if row else {"flows": 0, "bytes_": 0, "packets": 0}


__all__ = ["parse_range", "top_lan_hosts", "top_external_ips", "total_bytes", "_is_private"]
