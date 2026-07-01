"""Auto-discovery of LAN devices via the USG ARP table.

Walks ipNetToMediaTable (RFC1213), classifies vendor by MAC OUI, optionally
probes SNMPv2c against each candidate to enrich with sysName/sysDescr.
"""
import asyncio
import ipaddress
import logging
import time

from ..cache import database as db
from ..config import settings
from ..snmp.client import SnmpReadError, snmp_get_remote, snmp_walk
from .oui import classify_by_sysdescr, lookup_vendor, normalize_mac

log = logging.getLogger(__name__)


ARP_PHYS_BASE = "1.3.6.1.2.1.4.22.1.2"   # ipNetToMediaPhysAddress
ARP_NETADDR_BASE = "1.3.6.1.2.1.4.22.1.3"  # ipNetToMediaNetAddress
ARP_IFINDEX_BASE = "1.3.6.1.2.1.4.22.1.1"  # ipNetToMediaIfIndex

# Probe OIDs for arbitrary SNMP devices
SYS_NAME_OID = "1.3.6.1.2.1.1.5.0"
SYS_DESCR_OID = "1.3.6.1.2.1.1.1.0"
SYS_UPTIME_OID = "1.3.6.1.2.1.1.3.0"
SYS_OBJECT_OID = "1.3.6.1.2.1.1.2.0"

# Generic CPU/MEM OIDs from HOST-RESOURCES MIB (work on many switches/APs)
HR_PROCESSOR_LOAD = "1.3.6.1.2.1.25.3.3.1.2"
HR_STORAGE_SIZE = "1.3.6.1.2.1.25.2.3.1.5"
HR_STORAGE_USED = "1.3.6.1.2.1.25.2.3.1.6"


def _is_private(ip: str) -> bool:
    try:
        a = ipaddress.ip_address(ip)
        return a.is_private and not a.is_loopback and not a.is_link_local
    except ValueError:
        return False


async def _walk_arp() -> dict[str, dict]:
    """Return {ip: {mac, if_index}} from USG's ARP table."""
    phys = await snmp_walk(ARP_PHYS_BASE)
    idx = await snmp_walk(ARP_IFINDEX_BASE)

    by_ip: dict[str, dict] = {}
    for oid_str, mac_val in phys.items():
        # OID tail: <ifIndex>.<a>.<b>.<c>.<d>
        suffix = oid_str[len(ARP_PHYS_BASE) + 1:]
        parts = suffix.split(".")
        if len(parts) < 5:
            continue
        if_idx = int(parts[0])
        ip = ".".join(parts[1:5])
        if not _is_private(ip):
            continue
        mac = normalize_mac(mac_val)
        by_ip[ip] = {"mac": mac, "if_index": if_idx}

    # Match if_indices via the dedicated walk (extra confidence)
    for oid_str, val in idx.items():
        suffix = oid_str[len(ARP_IFINDEX_BASE) + 1:]
        parts = suffix.split(".")
        if len(parts) < 5:
            continue
        ip = ".".join(parts[1:5])
        if ip in by_ip and isinstance(val, int):
            by_ip[ip]["if_index"] = val

    return by_ip


async def _probe_snmp(ip: str) -> dict | None:
    if not settings.device_snmp_probe_enabled:
        return None
    try:
        r = await snmp_get_remote(
            ip, settings.device_snmp_community,
            [SYS_NAME_OID, SYS_DESCR_OID, SYS_UPTIME_OID],
            timeout=settings.device_snmp_timeout_s, retries=1,
        )
    except SnmpReadError:
        return None
    except Exception as e:
        log.debug("probe %s failed: %s", ip, e)
        return None
    return {
        "sys_name": str(r.get(SYS_NAME_OID, "")) or None,
        "sys_descr": str(r.get(SYS_DESCR_OID, "")) or None,
        "uptime_ticks": int(r.get(SYS_UPTIME_OID, 0) or 0),
    }


async def _poll_device_metrics(ip: str) -> dict | None:
    """Poll CPU/MEM/uptime from a device that previously responded to SNMP."""
    if not settings.device_snmp_probe_enabled:
        return None
    try:
        r = await snmp_get_remote(
            ip, settings.device_snmp_community,
            [SYS_UPTIME_OID],
            timeout=settings.device_snmp_timeout_s, retries=1,
        )
    except SnmpReadError:
        return None
    except Exception:
        return None

    cpu_pct = mem_pct = None
    uptime_ticks = int(r.get(SYS_UPTIME_OID, 0) or 0)

    # CPU: average of hrProcessorLoad rows
    try:
        from ..snmp.client import snmp_get_remote as _get
        # Try common OIDs one at a time (cheap), fall back gracefully.
        # We don't know the cardinality, so just try ".1" and ".2"
        cpus = []
        for sub in (1, 2, 3, 4):
            try:
                r2 = await _get(
                    ip, settings.device_snmp_community,
                    [f"{HR_PROCESSOR_LOAD}.{sub}"],
                    timeout=settings.device_snmp_timeout_s, retries=0,
                )
                val = r2.get(f"{HR_PROCESSOR_LOAD}.{sub}")
                if isinstance(val, int):
                    cpus.append(val)
            except Exception:
                break
        if cpus:
            cpu_pct = sum(cpus) / len(cpus)
    except Exception:
        pass

    return {"cpu_pct": cpu_pct, "mem_pct": mem_pct, "uptime_sec": uptime_ticks // 100}


async def scan_once() -> dict:
    """Walk ARP, classify and persist. Optionally probe SNMP for enrichment.
    Returns summary stats."""
    if not settings.device_scan_enabled:
        return {"enabled": False}

    now = int(time.time())
    try:
        arp = await _walk_arp()
    except SnmpReadError as e:
        log.warning("ARP walk failed: %s", e)
        return {"enabled": True, "error": str(e)}

    items = list(arp.items())[: settings.device_max_per_scan]

    sem = asyncio.Semaphore(settings.device_snmp_concurrency)
    enriched_count = 0
    network_gear_count = 0

    async def handle(ip: str, info: dict) -> None:
        nonlocal enriched_count, network_gear_count
        mac = info.get("mac")
        if_index = info.get("if_index")
        vendor, gear_by_oui = lookup_vendor(mac)

        sys_name = sys_descr = None
        device_type = None
        snmp_ok = False

        async with sem:
            probe = await _probe_snmp(ip)
        if probe:
            snmp_ok = True
            enriched_count += 1
            sys_name = probe.get("sys_name")
            sys_descr = probe.get("sys_descr")
            device_type = classify_by_sysdescr(sys_descr)

        # Heuristic device_type fallback by OUI
        if device_type is None and gear_by_oui:
            device_type = "switch"  # safe default for network-gear OUIs
        if device_type in ("switch", "router", "ap"):
            network_gear_count += 1

        await db.upsert_device(
            ip=ip, mac=mac, vendor=vendor, hostname=sys_name,
            sys_descr=sys_descr, device_type=device_type,
            snmp_ok=snmp_ok, if_index_fw=if_index, now_ts=now,
        )

        if probe:
            metrics = await _poll_device_metrics(ip)
            if metrics:
                await db.insert_device_metric(
                    now, ip, metrics["cpu_pct"], metrics["mem_pct"], metrics["uptime_sec"],
                )

    await asyncio.gather(*(handle(ip, info) for ip, info in items), return_exceptions=True)

    return {
        "enabled": True,
        "scanned": len(items),
        "total_arp": len(arp),
        "snmp_responded": enriched_count,
        "network_gear": network_gear_count,
    }
