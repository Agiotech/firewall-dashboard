import time

from fastapi import APIRouter

from ...services import system as sys_svc
from ...syslog import listener as syslog_listener

router = APIRouter()


@router.get("/system/syslog-status")
async def get_syslog_status() -> dict:
    return syslog_listener.get_status()


@router.get("/system/series")
async def get_system_series(range: str = "1h") -> dict:
    range_map = {"5m": 300, "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 3600)
    data = await sys_svc.get_system_series(range_s)
    return {
        "data": data,
        "ts_from": int(time.time()) - range_s,
        "ts_to": int(time.time()),
        "resolution_s": 30,
    }


@router.get("/system/latest")
async def get_system_latest() -> dict:
    row = await sys_svc.get_latest_system()
    return {"data": row}
