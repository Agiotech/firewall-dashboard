import time

from fastapi import APIRouter

from ...config import settings
from ...services import flows as flows_svc
from ...services import lan as lan_svc

router = APIRouter()


@router.get("/lan/ports")
async def get_lan_ports() -> dict:
    rows = await lan_svc.get_lan_latest()
    by_name = {r["port_name"]: r for r in rows}
    configured = settings.lan_list
    data = []
    for name in configured:
        row = by_name.get(name)
        if row:
            data.append(row)
        else:
            data.append({
                "port_name": name, "ts": int(time.time()),
                "oper_status": 0, "bps_in": 0.0, "bps_out": 0.0,
                "errors_in": 0.0, "errors_out": 0.0, "speed_mbps": 0,
            })
    for r in rows:
        if r["port_name"] not in configured:
            data.append(r)
    return {"data": data, "ts": int(time.time())}


@router.get("/lan/ports/{port}/metrics")
async def get_lan_port_metrics(port: str, range: str = "24h") -> dict:
    range_map = {"1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 86400)
    return {"data": await lan_svc.get_lan_series(port, range_s), "meta": {"port": port}}


@router.get("/lan/errors-heatmap")
async def get_lan_errors_heatmap(range: str = "24h") -> dict:
    range_map = {"1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 86400)
    bucket = 300 if range_s <= 3600 else 600 if range_s <= 86400 else 3600
    return await lan_svc.errors_heatmap(range_s, bucket)


@router.get("/lan/ports/{port}/errors-detail")
async def get_lan_errors_detail(port: str, range: str = "24h") -> dict:
    range_map = {"1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 86400)
    return {"data": await lan_svc.errors_detail(port, range_s), "meta": {"port": port}}


@router.get("/lan/ports/{port}/top-hosts")
async def get_lan_port_top_hosts(port: str, range: str = "1h", limit: int = 20) -> dict:
    range_map = {"5m": 300, "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 3600)
    limit = max(1, min(limit, 100))
    cidr = settings.lan_port_subnets_map.get(port)
    payload = await flows_svc.top_hosts_in_subnet(cidr or "", range_s, limit)
    payload["range_s"] = range_s
    payload["port"] = port
    payload["ts"] = int(time.time())
    # If the configured CIDR has no traffic, surface candidate subnets so the
    # user can fix the mapping. Also include them when the port isn't mapped.
    no_traffic = (not payload["download"]) and (not payload["upload"])
    if no_traffic:
        payload["suggested_subnets"] = await flows_svc.discover_active_private_subnets(range_s)
    else:
        payload["suggested_subnets"] = []
    return payload
