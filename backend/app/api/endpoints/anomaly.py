import time

from fastapi import APIRouter

from ...services import anomaly as anom_svc

router = APIRouter()


@router.get("/anomaly/wan/{name}")
async def get_wan_anomaly(name: str, range: str = "24h", weeks: int = 4) -> dict:
    range_map = {"6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 86400)
    weeks = max(1, min(weeks, 8))
    data = await anom_svc.wan_anomaly_bands(name, range_s, weeks)
    return {**data, "wan": name, "range_s": range_s, "ts": int(time.time())}
