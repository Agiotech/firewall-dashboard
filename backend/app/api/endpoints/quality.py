import time

from fastapi import APIRouter

from ...config import settings
from ...services import quality as q_svc

router = APIRouter()


@router.get("/quality/series")
async def get_quality_series(target: str | None = None, range: str = "1h") -> dict:
    range_map = {"5m": 300, "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 3600)
    data = await q_svc.get_quality_series(target, range_s)
    return {
        "data": data,
        "ts_from": int(time.time()) - range_s,
        "ts_to": int(time.time()),
        "targets": settings.quality_targets_list,
    }


@router.get("/quality/percentiles")
async def get_quality_percentiles(target: str, range: str = "1h") -> dict:
    range_map = {"1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 3600)
    return await q_svc.get_quality_percentiles(target, range_s)


@router.get("/quality/latest")
async def get_quality_latest() -> dict:
    return {"data": await q_svc.latest_by_target()}
