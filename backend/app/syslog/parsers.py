import re
from dataclasses import dataclass

PRI_RE = re.compile(r"^<(\d+)>")
KV_QUOTED_RE = re.compile(r'(\w+)="([^"]*)"')
KV_UNQUOTED_RE = re.compile(r'([A-Za-z_]\w*)=([^\s"]+)')

# Tunnel name typically looks like "VPN-XXX-YYY" or "Tunnel-Name" in messages
VPN_TUNNEL_NAME_RE = re.compile(r"\b(VPN[-_][\w.-]+)")
VPN_UP_RE = re.compile(r"\b(established|connected|up|ESTABLISHED|active)\b", re.IGNORECASE)
VPN_DOWN_RE = re.compile(r"\b(deleted|terminated|disconnect|down|deactivated)\b", re.IGNORECASE)
VPN_DPD_RE = re.compile(r"\bDPD\b", re.IGNORECASE)
VPN_REKEY_RE = re.compile(r"\brekey", re.IGNORECASE)

PRIORITY_NAMES = {
    0: "emerg", 1: "alert", 2: "critical", 3: "error",
    4: "warning", 5: "notice", 6: "info", 7: "debug",
}


@dataclass
class ParsedEvent:
    severity: int
    priority_name: str
    facility: int
    category: str | None
    message: str | None
    src_ip: str | None
    src_port: int | None
    dst_ip: str | None
    dst_port: int | None
    action: str | None
    note: str | None
    # Traffic-log specific
    sent_bytes: int
    rcvd_bytes: int
    proto: str | None
    dir_: str | None
    mac: str | None
    user: str | None
    raw: str


def _split_ip_port(s: str | None) -> tuple[str | None, int | None]:
    if not s:
        return None, None
    if ":" in s:
        ip, _, port = s.rpartition(":")
        try:
            return ip, int(port)
        except ValueError:
            return s, None
    return s, None


def _to_int(s: str | None) -> int:
    if not s:
        return 0
    try:
        return int(s)
    except ValueError:
        return 0


def extract_vpn_info(msg: str | None) -> dict | None:
    """Extract tunnel name and event semantics from an IPSec VPN syslog message.

    Returns dict with: tunnel_name (or None), event_type (dpd|up|down|rekey|info),
    or None if msg is empty.
    """
    if not msg:
        return None
    name_m = VPN_TUNNEL_NAME_RE.search(msg)
    tunnel = name_m.group(1) if name_m else None

    if VPN_DPD_RE.search(msg):
        return {"tunnel_name": tunnel, "event_type": "dpd"}
    if VPN_DOWN_RE.search(msg):
        return {"tunnel_name": tunnel, "event_type": "down"}
    if VPN_REKEY_RE.search(msg):
        return {"tunnel_name": tunnel, "event_type": "rekey"}
    if VPN_UP_RE.search(msg):
        return {"tunnel_name": tunnel, "event_type": "up"}
    return {"tunnel_name": tunnel, "event_type": "info"}


def parse_zyxel(line: str) -> ParsedEvent | None:
    line = line.strip()
    if not line:
        return None

    pri = 13
    m = PRI_RE.match(line)
    rest = line
    if m:
        pri = int(m.group(1))
        rest = line[m.end():]

    severity = pri & 0x07
    facility = pri >> 3

    # First quoted, then unquoted (unquoted only fills fields not already captured)
    kvs: dict[str, str] = {k: v for k, v in KV_QUOTED_RE.findall(rest)}
    sanitized = KV_QUOTED_RE.sub(" ", rest)
    for k, v in KV_UNQUOTED_RE.findall(sanitized):
        if k not in kvs:
            kvs[k] = v

    src_ip, src_port = _split_ip_port(kvs.get("src"))
    dst_ip, dst_port = _split_ip_port(kvs.get("dst"))

    return ParsedEvent(
        severity=severity,
        priority_name=PRIORITY_NAMES.get(severity, "info"),
        facility=facility,
        category=kvs.get("cat"),
        message=kvs.get("msg") or rest[:300],
        src_ip=src_ip,
        src_port=src_port,
        dst_ip=dst_ip,
        dst_port=dst_port,
        action=kvs.get("action"),
        note=kvs.get("note"),
        sent_bytes=_to_int(kvs.get("sent")),
        rcvd_bytes=_to_int(kvs.get("rcvd")),
        proto=kvs.get("proto"),
        dir_=kvs.get("dir"),
        mac=kvs.get("mac"),
        user=kvs.get("user") or kvs.get("suser"),
        raw=line,
    )
