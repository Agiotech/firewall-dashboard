"""Curated, static device inventory.

Unlike `devices` (auto-discovered via the firewall ARP table), this is a manually
maintained catalog of known infrastructure: access points, printers, servers,
switches and XVRs. Each entry is correlated by IP with `flow_aggregates` to show
per-device download/upload consumption.

To add/remove equipment, edit INVENTORY below. `type` must be one of the keys in
TYPE_LABELS so the frontend knows which icon/color to render.
"""

TYPE_LABELS: dict[str, str] = {
    "ap": "Access Point",
    "printer": "Impresora",
    "server": "Servidor",
    "switch": "Switch",
    "xvr": "XVR",
}


def _norm_mac(mac: str) -> str:
    """Normalize a MAC to uppercase colon-separated, zero-padded octets."""
    raw = mac.replace("-", ":").replace(".", ":").strip()
    parts = [p for p in raw.split(":") if p != ""]
    return ":".join(p.upper().zfill(2) for p in parts)


# (type, name, ip, mac) — edit this list to maintain the inventory.
_RAW: list[tuple[str, str, str, str]] = [
    ("ap", "Access Point Almacén Surtido", "192.168.5.10", "C0:83:C9:1F:9E:43"),
    ("ap", "Access Point Nebula Almacén", "192.168.3.150", "6C:4F:89:35:E5:D8"),
    ("ap", "Access Point Nebula Finanzas", "192.168.3.19", "6C:4F:89:35:E4:6C"),
    ("ap", "Access Point Nebula Producción", "192.168.3.16", "7C:77:16:1E:74:B0"),
    ("ap", "Access Point Nebula RH", "192.168.3.11", "6C:4F:89:35:E4:98"),
    ("ap", "Access Point Nebula Sala de Juntas PA", "192.168.3.12", "6C:4F:89:35:E5:60"),
    ("ap", "Access Point Nebula Sala de Juntas PB", "192.168.3.13", "6C:4F:89:35:E3:E0"),
    ("ap", "Access Point Pruebas RIO", "192.168.5.71", "C4:41:1E:1F:0E:3B"),
    ("ap", "Access Point Pruebas SEM", "192.168.5.101", "40-ED-00-CC-FD-80"),
    ("printer", "HP LaserJet MFP M130nw", "192.168.1.139", "E4:E7:49:A6:83:2F"),
    ("printer", "HP LaserJet MFP M236sdw", "192.168.1.38", "28:C5:C8:9F:42:DA"),
    ("printer", "HP LaserJet Pro 4001n", "192.168.1.19", "BC:0F:F3:33:8F:6F"),
    ("printer", "HP LaserJet Pro MFP M127fn", "192.168.2.32", "30:8D:99:AF:62:F8"),
    ("printer", "Kyocera ECOSYS MA4000wfx", "192.168.1.27", "D4:F0:C9:22:48:71"),
    ("printer", "Zebra GX430t", "192.168.1.197", "00:07:4D:AB:8C:EE"),
    ("printer", "Zebra ZD621-203dpi ZPL", "192.168.1.227", "60:95:32:50:EB:F9"),
    ("printer", "Zebra ZD621-203dpi ZPL", "192.168.1.237", "60:95:32:4A:46:5D"),
    ("printer", "Zebra ZD621-300dpi ZPL", "192.168.1.41", "00:07:4D:F1:C3:CB"),
    ("server", "Servidor Agionet", "192.168.1.7", "54:80:28:4F:09:6E"),
    ("server", "Servidor Agionet Old", "192.168.1.6", "AC:16:2D:89:8E:98"),
    ("server", "Servidor Archivos", "192.168.1.2", "50:9A:4C:A3:2B:80"),
    ("server", "Servidor Avaya", "192.168.0.253", "50:9A:4C:A1:D2:AE"),
    ("server", "Servidor BioTime", "192.168.1.8", "6C:2B:59:97:C8:5C"),
    ("server", "Servidor Contpaqi", "192.168.1.9", "AC:16:2D:89:A8:8E"),
    ("server", "Servidor Dominio", "192.168.1.10", "50:9A:4C:A3:23:08"),
    ("switch", "Switch Cisco", "192.168.1.16", "74:11:B2:96:79:59"),
    ("switch", "Switch Cisco", "192.168.1.17", "00:21:A1:BC:A1:C0"),
    ("switch", "Switch Cisco", "192.168.1.20", "00:17:0E:66:71:80"),
    ("switch", "Switch Zyxel GS1920", "192.168.1.21", "D8:EC:E5:9E:F0:98"),
    ("switch", "Switch Zyxel GS1920", "192.168.1.24", "D8:EC:E5:9E:DC:13"),
    ("switch", "Switch Zyxel GS1920", "192.168.2.10", "BC:99:11:9A:FC:17"),
    ("xvr", "XVR 1", "192.168.1.221", "38:AF:29:2B:A3:A5"),
    ("xvr", "XVR 2", "192.168.1.202", "38:AF:29:2B:9E:83"),
    ("xvr", "XVR 3", "192.168.1.203", "38:AF:29:49:48:7F"),
    ("xvr", "XVR 4", "192.168.1.204", "38:AF:29:62:4D:07"),
    ("xvr", "XVR 5", "192.168.1.205", "38:AF:29:2B:9E:7C"),
    ("xvr", "XVR 6", "192.168.1.206", "38:AF:29:49:48:65"),
    ("xvr", "XVR 7", "192.168.1.222", "38:AF:29:49:48:84"),
    ("xvr", "XVR 8", "192.168.1.208", "38:AF:29:49:48:83"),
    ("xvr", "XVR 9", "192.168.1.209", "38:AF:29:62:4E:F3"),
    ("xvr", "XVR 10", "192.168.1.223", "14:A7:08:93:90:04"),
    ("xvr", "XVR 11", "192.168.1.211", "38:AF:29:2B:9D:D9"),
    ("xvr", "XVR 12", "192.168.1.212", "38:AF:29:2B:9D:D2"),
    ("xvr", "XVR TEC SEM", "192.168.3.129", "B4:4C:3B:1B:84:CA"),
]

INVENTORY: list[dict] = [
    {
        "type": t,
        "type_label": TYPE_LABELS.get(t, t),
        "name": name,
        "ip": ip,
        "mac": _norm_mac(mac),
    }
    for (t, name, ip, mac) in _RAW
]


def inventory_ips() -> list[str]:
    return [d["ip"] for d in INVENTORY]


def inventory_summary() -> dict:
    by_type: dict[str, int] = {}
    for d in INVENTORY:
        by_type[d["type"]] = by_type.get(d["type"], 0) + 1
    return {"total": len(INVENTORY), "by_type": by_type}
