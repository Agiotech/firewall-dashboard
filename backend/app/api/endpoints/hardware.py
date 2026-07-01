import time

from fastapi import APIRouter

from ...services import hardware as hw_svc

router = APIRouter()


@router.get("/hardware/latest")
async def get_latest_hardware() -> dict:
    return {"data": await hw_svc.latest_hardware(), "ts": int(time.time())}


@router.get("/hardware/series")
async def get_hardware_series(kind: str, name: str, range: str = "24h") -> dict:
    range_map = {"1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 86400)
    return {
        "data": await hw_svc.hardware_series(kind, name, range_s),
        "meta": {"kind": kind, "name": name},
    }
