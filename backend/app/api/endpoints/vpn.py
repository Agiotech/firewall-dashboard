import time

from fastapi import APIRouter

from ...services import vpn as vpn_svc

router = APIRouter()


@router.get("/vpn/tunnels")
async def get_tunnels(state: str | None = None) -> dict:
    data = await vpn_svc.list_tunnels(only_state=state)
    summary = await vpn_svc.tunnel_summary()
    return {"data": data, "summary": summary, "ts": int(time.time())}


@router.get("/vpn/clients")
async def get_clients(active_only: bool = False, limit: int = 200) -> dict:
    data = await vpn_svc.list_client_sessions(active_only=active_only, limit=limit)
    summary = await vpn_svc.client_summary()
    return {"data": data, "summary": summary, "ts": int(time.time())}


@router.get("/vpn/events")
async def get_vpn_events(limit: int = 100) -> dict:
    return {"data": await vpn_svc.vpn_events_recent(limit), "ts": int(time.time())}


@router.get("/vpn/summary")
async def get_vpn_summary() -> dict:
    tun = await vpn_svc.tunnel_summary()
    cli = await vpn_svc.client_summary()
    return {"tunnels": tun, "clients": cli, "ts": int(time.time())}


@router.get("/vpn/uptime")
async def get_vpn_uptime(range: str = "24h") -> dict:
    range_map = {"24h": 86400, "7d": 7 * 86400, "30d": 30 * 86400}
    range_s = range_map.get(range, 86400)
    data = await vpn_svc.all_tunnels_uptime(range_s)
    return {"data": data, "range_s": range_s, "ts": int(time.time())}


@router.get("/vpn/traffic")
async def get_vpn_traffic(range: str = "1h") -> dict:
    range_map = {"5m": 300, "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 3600)
    data = await vpn_svc.tunnel_traffic(range_s)
    return {"data": data, "range_s": range_s, "ts": int(time.time())}


@router.get("/vpn/usage-heatmap")
async def get_vpn_usage_heatmap(tunnel: str, range: str = "30d") -> dict:
    range_map = {"7d": 7 * 86400, "30d": 30 * 86400, "90d": 90 * 86400}
    range_s = range_map.get(range, 30 * 86400)
    payload = await vpn_svc.tunnel_usage_heatmap(tunnel, range_s)
    payload["range_s"] = range_s
    payload["ts"] = int(time.time())
    return payload


@router.get("/vpn/daily-heatmap")
async def get_vpn_daily_heatmap(range: str = "30d") -> dict:
    range_map = {"7d": 7 * 86400, "30d": 30 * 86400, "90d": 90 * 86400}
    range_s = range_map.get(range, 30 * 86400)
    payload = await vpn_svc.tunnels_daily_heatmap(range_s)
    payload["range_s"] = range_s
    payload["ts"] = int(time.time())
    return payload
