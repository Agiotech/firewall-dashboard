import time

from fastapi import APIRouter, BackgroundTasks, HTTPException

from ...devices.discovery import scan_once
from ...devices.inventory import INVENTORY, inventory_ips, inventory_summary
from ...services import devices as dev_svc
from ...services import dhcp as dhcp_svc

router = APIRouter()

_RANGE_MAP = {"5m": 300, "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800, "15d": 1296000, "30d": 2592000}


@router.get("/devices/inventory")
async def get_devices_inventory(range: str = "1h") -> dict:
    """Curated equipment catalog with per-device download/upload over the window."""
    range_s = _RANGE_MAP.get(range, 3600)
    traffic = await dev_svc.traffic_for_ips(inventory_ips(), range_s)
    data = []
    for d in INVENTORY:
        t = traffic.get(d["ip"], {"bytes_in": 0, "bytes_out": 0})
        bytes_in = t["bytes_in"]
        bytes_out = t["bytes_out"]
        data.append(
            {
                **d,
                "bytes_in": bytes_in,
                "bytes_out": bytes_out,
                "bytes_total": bytes_in + bytes_out,
            }
        )
    return {
        "data": data,
        "summary": inventory_summary(),
        "range_s": range_s,
        "ts": int(time.time()),
    }


@router.get("/devices")
async def get_devices(type: str | None = None, limit: int = 500) -> dict:
    limit = max(1, min(limit, 2000))
    data = await dev_svc.list_devices(only_type=type, limit=limit)
    if data:
        dhcp_map = await dhcp_svc.bulk_lookup([d["ip"] for d in data])
        for d in data:
            dhcp = dhcp_map.get(d["ip"])
            if dhcp:
                # Add DHCP hostname/description without overwriting SNMP hostname
                d["dhcp_hostname"] = dhcp.get("hostname")
                d["dhcp_description"] = dhcp.get("description")
                if not d.get("hostname"):
                    d["hostname"] = dhcp.get("hostname")
                if not d.get("mac") and dhcp.get("mac"):
                    d["mac"] = dhcp.get("mac")
    summary = await dev_svc.device_summary()
    return {"data": data, "summary": summary, "ts": int(time.time())}


@router.get("/devices/traffic-top")
async def get_devices_traffic_top(range: str = "1h", limit: int = 20) -> dict:
    range_map = {"5m": 300, "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 3600)
    limit = max(1, min(limit, 100))
    devices = await dev_svc.list_devices(limit=2000)
    by_ip = {d["ip"]: d for d in devices}
    top = await dev_svc.device_traffic_top(range_s, limit)
    dhcp_map = await dhcp_svc.bulk_lookup([r["ip"] for r in top])
    for r in top:
        meta = by_ip.get(r["ip"], {})
        dhcp = dhcp_map.get(r["ip"], {})
        r["vendor"] = meta.get("vendor") or dhcp.get("vendor")
        # DHCP hostname/description trump device discovery hostname when present
        r["hostname"] = dhcp.get("hostname") or meta.get("hostname")
        r["description"] = dhcp.get("description")
        r["device_type"] = meta.get("device_type")
        r["mac"] = meta.get("mac") or dhcp.get("mac")
    return {"data": top, "range_s": range_s, "ts": int(time.time())}


@router.get("/devices/{ip}/traffic")
async def get_device_traffic(ip: str, range: str = "1h") -> dict:
    range_map = {"5m": 300, "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 3600)
    bucket = 60 if range_s <= 3600 else 300 if range_s <= 86400 else 3600
    series = await dev_svc.device_traffic_series(ip, range_s, bucket)
    return {"data": series, "range_s": range_s, "bucket_s": bucket, "meta": {"ip": ip}}


@router.get("/devices/{ip}/metrics")
async def get_device_metrics(ip: str, range: str = "1h") -> dict:
    range_map = {"5m": 300, "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 3600)
    return {"data": await dev_svc.device_metrics_series(ip, range_s), "meta": {"ip": ip}}


@router.get("/devices/{ip}/detail")
async def get_device_detail(ip: str, range: str = "24h") -> dict:
    range_map = {"1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 86400)
    devices = await dev_svc.list_devices(limit=2000)
    info = next((d for d in devices if d["ip"] == ip), None)
    dhcp = await dhcp_svc.lookup(ip)
    if dhcp:
        info = info or {"ip": ip}
        info["dhcp_hostname"] = dhcp.get("hostname")
        info["dhcp_description"] = dhcp.get("description")
        if not info.get("hostname"):
            info["hostname"] = dhcp.get("hostname")
    traffic = await dev_svc.device_traffic_series(ip, range_s, 300 if range_s <= 86400 else 3600)
    tops = await dev_svc.device_top_destinations(ip, range_s)
    events = await dev_svc.device_events(ip, range_s, 40)
    metrics = await dev_svc.device_metrics_series(ip, range_s)
    return {
        "device": info,
        "traffic": traffic,
        "top_destinations": tops,
        "events": events,
        "metrics": metrics,
        "range_s": range_s,
    }


@router.get("/devices/_/new")
async def get_new_devices(days: int = 7, limit: int = 100) -> dict:
    days = max(1, min(days, 90))
    data = await dev_svc.list_new_devices(days, limit)
    return {"data": data, "days": days, "ts": int(time.time())}


@router.get("/devices/_/vendors")
async def get_vendor_distribution() -> dict:
    data = await dev_svc.vendor_distribution()
    return {"data": data, "ts": int(time.time())}


@router.post("/devices/scan")
async def trigger_scan(background: BackgroundTasks) -> dict:
    """Trigger a discovery scan in the background."""
    background.add_task(scan_once)
    return {"status": "started", "ts": int(time.time())}


@router.get("/devices/scan/status")
async def scan_status() -> dict:
    summary = await dev_svc.device_summary()
    return summary
