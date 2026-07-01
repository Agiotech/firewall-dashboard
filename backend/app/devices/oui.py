"""Minimal MAC OUI -> vendor lookup. Covers common network equipment vendors.

Use a few first-octet prefixes per vendor. For unknown MACs, returns None.
The set of network-gear vendors is also exposed for filtering.
"""

# Prefix (first 6 hex chars, uppercase, no separator) -> (vendor, is_network_gear)
OUI_PREFIXES: dict[str, tuple[str, bool]] = {
    # Cisco
    "001A": ("Cisco", True), "001B": ("Cisco", True), "001C": ("Cisco", True),
    "001D": ("Cisco", True), "001E": ("Cisco", True), "001F": ("Cisco", True),
    "0021A0": ("Cisco", True), "0021A1": ("Cisco", True), "0023": ("Cisco", True),
    "002414": ("Cisco", True), "0024C4": ("Cisco", True), "0025": ("Cisco", True),
    "002698": ("Cisco", True), "0026CA": ("Cisco", True), "00DEFB": ("Cisco", True),
    "001106": ("Cisco", True), "B414": ("Cisco", True), "BCD16": ("Cisco", True),
    # Cisco Meraki
    "00187D": ("Cisco Meraki", True), "E04F43": ("Cisco Meraki", True),

    # HPE / Aruba
    "001F28": ("HP", True), "001F29": ("HP", True), "00215A": ("HP", True),
    "002264": ("HP", True), "002392": ("HP", True), "0023AE": ("HP", True),
    "002481": ("HP", True), "0024A8": ("HP", True), "0025B3": ("HP", True),
    "002655": ("HP", True), "0026F1": ("HP", True),
    "001A1E": ("Aruba", True), "00246C": ("Aruba", True), "AC162D": ("Aruba", True),
    "94B40F": ("Aruba", True), "9C8CD8": ("Aruba", True),

    # Ubiquiti
    "0418D6": ("Ubiquiti", True), "245A4C": ("Ubiquiti", True),
    "788A20": ("Ubiquiti", True), "44D9E7": ("Ubiquiti", True),
    "DC9FDB": ("Ubiquiti", True), "FCECDA": ("Ubiquiti", True),
    "242C13": ("Ubiquiti", True), "B4FBE4": ("Ubiquiti", True),

    # MikroTik
    "000C42": ("MikroTik", True), "4C5E0C": ("MikroTik", True),
    "6C3B6B": ("MikroTik", True), "B869F4": ("MikroTik", True),
    "C4AD34": ("MikroTik", True), "DC2C6E": ("MikroTik", True),
    "E48D8C": ("MikroTik", True), "744D28": ("MikroTik", True),

    # Zyxel
    "001349": ("Zyxel", True), "0019CB": ("Zyxel", True), "001B53": ("Zyxel", True),
    "00A0C5": ("Zyxel", True), "5067F0": ("Zyxel", True), "B0B2DC": ("Zyxel", True),
    "9C97F4": ("Zyxel", True), "EC4374": ("Zyxel", True), "F44D5C": ("Zyxel", True),

    # TP-Link (often used as cheap switches)
    "001D0F": ("TP-Link", True), "1027F5": ("TP-Link", True),
    "5C899A": ("TP-Link", True), "847A88": ("TP-Link", True),
    "98DAC4": ("TP-Link", True), "F4F26D": ("TP-Link", True),

    # Apple, Intel, Dell — usually end-user devices, NOT network gear
    "001451": ("Apple", False), "0016CB": ("Apple", False),
    "001D4F": ("Apple", False), "001EC2": ("Apple", False),
    "002241": ("Apple", False), "002500": ("Apple", False),
    "0026B0": ("Apple", False), "0026BB": ("Apple", False),
    "040E3C": ("Apple", False), "04D3CF": ("Apple", False),
    "8C8590": ("Apple", False), "BCF4D4": ("Apple", False),

    "001E68": ("Intel", False), "0026C7": ("Intel", False),
    "001517": ("Intel", False), "00215C": ("Intel", False),
    "00D0B7": ("Intel", False), "B499BA": ("Intel", False),
    "E0C26B": ("Intel", False),

    "00188B": ("Dell", False), "0024E8": ("Dell", False),
    "002564": ("Dell", False), "B083FE": ("Dell", False),
    "B499BA": ("Dell", False), "F8B156": ("Dell", False),

    # Samsung / LG / Microsoft Surface / Lenovo (typical user devices)
    "001632": ("Samsung", False), "5C0A5B": ("Samsung", False),
    "002566": ("LG", False),
    "BCC810": ("Microsoft", False),
    "001A6B": ("Lenovo", False), "00219B": ("Lenovo", False),
}


def normalize_mac(mac: str | bytes | None) -> str | None:
    if mac is None:
        return None
    if isinstance(mac, bytes):
        if len(mac) >= 6:
            return ":".join(f"{b:02x}" for b in mac[:6])
        return None
    # Accept any of: "aabbccddeeff", "AA:BB:CC:DD:EE:FF", "AA-BB-CC-DD-EE-FF",
    # "0xaabbccddeeff" (pysnmp OctetString prettyPrint), "aa bb cc dd ee ff", etc.
    s = mac.strip().lower()
    if s.startswith("0x"):
        s = s[2:]
    # Strip any non-hex character (keeps only 0-9 a-f)
    hex_only = "".join(c for c in s if c in "0123456789abcdef")
    if len(hex_only) != 12:
        return None
    return ":".join(hex_only[i:i + 2] for i in range(0, 12, 2))


def lookup_vendor(mac: str | None) -> tuple[str | None, bool]:
    """Return (vendor_name, is_network_gear). Tries 6-char then 4-char prefix."""
    if not mac:
        return None, False
    hex_mac = mac.replace(":", "").upper()
    for prefix_len in (6, 4):
        prefix = hex_mac[:prefix_len]
        if prefix in OUI_PREFIXES:
            return OUI_PREFIXES[prefix]
    return None, False


def classify_by_sysdescr(sys_descr: str | None) -> str | None:
    if not sys_descr:
        return None
    s = sys_descr.lower()
    if "switch" in s:
        return "switch"
    if "router" in s or "firewall" in s or "gateway" in s or "usg" in s or "zywall" in s:
        return "router"
    if "access point" in s or "ap " in s or "aironet" in s or "unifi" in s:
        return "ap"
    if "printer" in s or "laserjet" in s:
        return "printer"
    if "ipphone" in s or "ip phone" in s or "voip" in s:
        return "phone"
    return None
