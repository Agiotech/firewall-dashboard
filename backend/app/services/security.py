"""Security analytics — attack timeline, port-scan scoring."""
import time

from ..cache.database import get_db


# Puertos "interesantes" — los que realmente atacan los actores maliciosos.
WELL_KNOWN_SERVICE_PORTS: set[int] = {
    # Acceso remoto
    22, 23, 3389, 5900, 5985, 5986,
    # Web
    80, 443, 8080, 8443, 8000, 8888,
    # Email
    25, 110, 143, 465, 587, 993, 995,
    # DNS / Dir
    53, 389, 636,
    # SMB/NetBIOS
    135, 137, 138, 139, 445,
    # Bases de datos
    1433, 1434, 3306, 5432, 6379, 27017, 9200, 5984, 11211,
    # File transfer
    20, 21, 69, 873, 2049,
    # SNMP
    161, 162,
    # VoIP signaling (RTP usa efímero — se ignora)
    5060, 5061, 1720,
    # SCADA / IoT
    102, 502, 789, 1911, 4840, 20000, 47808,
    # VPN
    500, 1701, 1723, 4500,
    # Otros targeteables
    9091, 8123, 9000, 9090, 7001, 7002, 5938,
    25565, 27015,
    6667, 6697,
    7777, 8181,
}


def _classify_attacker(distinct_ports: int, attempts: int, top_ports: list[dict]) -> tuple[str, str]:
    """Return (category, reason) where category ∈ {'attack','scan','service','noise'}."""
    port_set = {int(p["dst_port"]) for p in top_ports if p.get("dst_port") is not None}
    known_hits = port_set & WELL_KNOWN_SERVICE_PORTS
    all_ephemeral = all(p > 10000 for p in port_set) if port_set else True
    has_known = bool(known_hits)

    if has_known and distinct_ports >= 3:
        return "attack", f"Multi-port a servicios conocidos: {sorted(known_hits)}"
    if distinct_ports >= 5 and not all_ephemeral:
        return "scan", f"Escaneo con {distinct_ports} puertos mezclados"
    if has_known:
        return "service", f"Drops hacia servicio: {sorted(known_hits)}"
    if distinct_ports >= 8 and all_ephemeral:
        return "scan", f"Escaneo aleatorio efímero ({distinct_ports} puertos)"
    return "noise", "Pocos puertos efímeros — probable tráfico de retorno / NAT expirado"


async def attack_summary(range_s: int, limit: int = 50) -> list[dict]:
    """External IPs that hit DROPs against our WAN public IP, sorted by attempt count.
    Returns: src_ip, attempts, distinct_ports, first_seen, last_seen, top_ports."""
    since = int(time.time()) - range_s
    sql = """
        SELECT
            src_ip,
            COUNT(*) AS attempts,
            COUNT(DISTINCT dst_port) AS distinct_ports,
            MIN(ts) AS first_seen,
            MAX(ts) AS last_seen
        FROM events
        WHERE ts >= ?
          AND category = 'Security Policy Control'
          AND action = 'Drop'
          AND src_ip IS NOT NULL
          AND NOT (src_ip LIKE '10.%' OR src_ip LIKE '192.168.%' OR src_ip LIKE '172.1_.%'
                   OR src_ip LIKE '172.2_.%' OR src_ip LIKE '172.3_.%'
                   OR src_ip = '0.0.0.0' OR src_ip LIKE '169.254.%')
        GROUP BY src_ip
        ORDER BY attempts DESC
        LIMIT ?
    """
    async with get_db() as db:
        cur = await db.execute(sql, (since, limit))
        rows = [dict(r) for r in await cur.fetchall()]

        # For each attacker get top 5 ports + classify
        for row in rows:
            cur2 = await db.execute(
                "SELECT dst_port, COUNT(*) AS n FROM events "
                "WHERE ts >= ? AND src_ip = ? AND action = 'Drop' AND dst_port IS NOT NULL "
                "GROUP BY dst_port ORDER BY n DESC LIMIT 5",
                (since, row["src_ip"]),
            )
            row["top_ports"] = [dict(p) for p in await cur2.fetchall()]
            category, reason = _classify_attacker(
                row.get("distinct_ports") or 0,
                row.get("attempts") or 0,
                row["top_ports"],
            )
            row["category"] = category
            row["category_reason"] = reason
            # Score: ataques reales > scans > services > noise; ponderado por intentos
            weight = {"attack": 1000, "scan": 500, "service": 200, "noise": 0}[category]
            row["score"] = weight + (row.get("distinct_ports") or 0) * 10 + min(row["attempts"], 100)
    return rows


async def attack_timeline_buckets(range_s: int, bucket_s: int = 60) -> list[dict]:
    """Time-bucketed count of drop events from external IPs against our WAN."""
    since = int(time.time()) - range_s
    sql = f"""
        SELECT
            (ts / {bucket_s}) * {bucket_s} AS bucket_ts,
            COUNT(*) AS attempts,
            COUNT(DISTINCT src_ip) AS distinct_attackers
        FROM events
        WHERE ts >= ?
          AND category = 'Security Policy Control'
          AND action = 'Drop'
          AND src_ip IS NOT NULL
          AND NOT (src_ip LIKE '10.%' OR src_ip LIKE '192.168.%' OR src_ip LIKE '172.1_.%'
                   OR src_ip LIKE '172.2_.%' OR src_ip LIKE '172.3_.%'
                   OR src_ip = '0.0.0.0' OR src_ip LIKE '169.254.%')
        GROUP BY bucket_ts
        ORDER BY bucket_ts ASC
    """
    async with get_db() as db:
        cur = await db.execute(sql, (since,))
        return [dict(r) for r in await cur.fetchall()]


async def attacker_attempts(src_ip: str, range_s: int) -> list[dict]:
    """For a single attacker, return individual attempts (each port hit)."""
    since = int(time.time()) - range_s
    async with get_db() as db:
        cur = await db.execute(
            "SELECT ts, dst_port, dst_ip FROM events "
            "WHERE ts >= ? AND src_ip = ? AND action = 'Drop' "
            "ORDER BY ts ASC LIMIT 500",
            (since, src_ip),
        )
        return [dict(r) for r in await cur.fetchall()]
