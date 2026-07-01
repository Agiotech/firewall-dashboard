import time

from fastapi import APIRouter

from ...services import diagnostics as diag_svc

router = APIRouter()


@router.get("/diagnostics/timeline")
async def get_timeline(range: str = "24h") -> dict:
    range_map = {"1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 86400)
    data = await diag_svc.timeline(range_s)
    data["ts"] = int(time.time())
    return data
