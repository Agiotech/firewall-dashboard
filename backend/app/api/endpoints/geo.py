import time

from fastapi import APIRouter

from ...services import geoip as geo_svc
from ...services import vpn as vpn_svc

router = APIRouter()


@router.get("/geo/external")
async def get_external(range: str = "1h", top: int = 30) -> dict:
    range_map = {
        "5m": 300, "1h": 3600, "6h": 21600, "24h": 86400,
        "7d": 7 * 86400, "15d": 15 * 86400, "30d": 30 * 86400,
    }
    range_s = range_map.get(range, 3600)
    points = await geo_svc.aggregate_external_traffic(range_s, top_n=top)
    countries = await geo_svc.aggregate_by_country(range_s)
    return {"points": points, "countries": countries, "range_s": range_s, "ts": int(time.time())}


@router.get("/geo/branches")
async def get_branches() -> dict:
    data = await vpn_svc.tunnels_with_geo()
    return {"data": data, "ts": int(time.time())}
