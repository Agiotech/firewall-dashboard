"""Service for DHCP reservations imported from the firewall.

Provides CSV import, list/lookup, and a bulk_lookup for joining IPs with
hostname/description in alerts, peers, and top-talker views.
"""
import csv
import io
import logging
import time

from ..cache import database as db
from ..cache.database import get_db
from ..devices.oui import normalize_mac

log = logging.getLogger(__name__)


# Column name aliases (lowercase, trimmed) -> canonical field
COL_ALIASES: dict[str, str] = {
    "ip": "ip", "ip address": "ip", "ip_address": "ip", "ipaddress": "ip",
    "address": "ip", "dirección ip": "ip", "direccion ip": "ip",
    "mac": "mac", "mac address": "mac", "mac_address": "mac", "macaddress": "mac",
    "hardware address": "mac",
    "hostname": "hostname", "host name": "hostname", "host_name": "hostname",
    "name": "hostname", "nombre": "hostname",
    "description": "description", "descripcion": "description", "descripción": "description",
    "comment": "description", "notes": "description",
    "vlan": "vlan", "vlan id": "vlan", "vlan_id": "vlan", "vlanid": "vlan",
    "interface": "interface", "iface": "interface", "interfaz": "interface", "port": "interface",
    "status": "status", "estado": "status",
}


def _norm_header(h: str) -> str | None:
    if not h:
        return None
    return COL_ALIASES.get(h.strip().lower())


def parse_csv(text: str) -> list[dict]:
    """Parse a CSV (with header row) into a list of normalized records.

    Tolerates: comma or semicolon separator, BOM, mixed-case headers.
    Returns rows that have at least an IP.
    """
    if text.startswith("﻿"):
        text = text[1:]

    # Try comma first; if header row only finds 1 column, try semicolon
    sample = text[:2048]
    sep = ","
    if sample.count(";") > sample.count(","):
        sep = ";"

    reader = csv.reader(io.StringIO(text), delimiter=sep)
    try:
        headers = next(reader)
    except StopIteration:
        return []

    cols = [_norm_header(h) for h in headers]
    if "ip" not in cols:
        # Fallback: try the other separator
        other = ";" if sep == "," else ","
        reader = csv.reader(io.StringIO(text), delimiter=other)
        try:
            headers = next(reader)
        except StopIteration:
            return []
        cols = [_norm_header(h) for h in headers]
        if "ip" not in cols:
            raise ValueError(f"CSV is missing an IP column. Headers: {headers}")

    rows: list[dict] = []
    for raw in reader:
        if not raw or all(not c.strip() for c in raw):
            continue
        rec: dict = {}
        for i, field in enumerate(raw):
            if i >= len(cols):
                break
            key = cols[i]
            if key is None:
                continue
            v = field.strip()
            if not v:
                continue
            rec[key] = v
        if "ip" not in rec:
            continue
        if "mac" in rec:
            rec["mac"] = normalize_mac(rec["mac"]) or rec["mac"]
        rows.append(rec)
    return rows


async def import_records(records: list[dict], source: str = "manual") -> int:
    now = int(time.time())
    count = 0
    for r in records:
        ip = r.get("ip")
        if not ip:
            continue
        await db.upsert_dhcp_reservation(
            ip=ip,
            mac=r.get("mac"),
            hostname=r.get("hostname"),
            description=r.get("description"),
            vlan=r.get("vlan"),
            interface=r.get("interface"),
            status=r.get("status"),
            source=source,
            now_ts=now,
        )
        count += 1
    return count


async def list_reservations(limit: int = 1000) -> list[dict]:
    async with get_db() as conn:
        cur = await conn.execute(
            "SELECT ip, mac, hostname, description, vlan, interface, status, source, updated_at "
            "FROM dhcp_reservations ORDER BY ip LIMIT ?",
            (limit,),
        )
        return [dict(r) for r in await cur.fetchall()]


async def lookup(ip: str) -> dict | None:
    async with get_db() as conn:
        cur = await conn.execute(
            "SELECT ip, mac, hostname, description, vlan, interface "
            "FROM dhcp_reservations WHERE ip = ? LIMIT 1",
            (ip,),
        )
        row = await cur.fetchone()
        return dict(row) if row else None


async def bulk_lookup(ips: list[str]) -> dict[str, dict]:
    if not ips:
        return {}
    placeholders = ",".join("?" for _ in ips)
    async with get_db() as conn:
        cur = await conn.execute(
            f"SELECT ip, mac, hostname, description, vlan, interface "
            f"FROM dhcp_reservations WHERE ip IN ({placeholders})",
            tuple(ips),
        )
        rows = await cur.fetchall()
        return {r["ip"]: dict(r) for r in rows}


async def delete_one(ip: str) -> int:
    async with get_db() as conn:
        cur = await conn.execute("DELETE FROM dhcp_reservations WHERE ip = ?", (ip,))
        await conn.commit()
        return cur.rowcount or 0


async def count() -> int:
    async with get_db() as conn:
        cur = await conn.execute("SELECT COUNT(*) AS n FROM dhcp_reservations")
        row = await cur.fetchone()
        return int(row["n"]) if row else 0
