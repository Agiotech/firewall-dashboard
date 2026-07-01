import time

from fastapi import APIRouter

from ...services import wan as wan_svc

router = APIRouter()


@router.get("/wan/{name}/metrics")
async def get_wan_metrics(name: str, range: str = "1h") -> dict:
    range_s = wan_svc.parse_range(range)
    rows = await wan_svc.get_wan_series(name, range_s)
    return {
        "data": rows,
        "ts_from": int(time.time()) - range_s,
        "ts_to": int(time.time()),
        "resolution_s": 30,
        "meta": {"wan": name, "label": wan_svc.wan_label(name)},
    }


@router.get("/wan/{name}/status-history")
async def get_wan_status_history(name: str, range: str = "30d") -> dict:
    range_s = wan_svc.parse_range(range)
    rows = await wan_svc.get_status_history(name, range_s)
    return {
        "data": rows,
        "ts_from": int(time.time()) - range_s,
        "ts_to": int(time.time()),
        "meta": {"wan": name},
    }


@router.get("/wan/{name}/availability")
async def get_wan_availability(name: str, days: int = 90) -> dict:
    days = max(1, min(days, 365))
    data = await wan_svc.get_availability_per_day(name, days)
    return {"data": data, "days": days, "meta": {"wan": name, "label": wan_svc.wan_label(name)}}


@router.get("/wan/{name}/downtime")
async def get_wan_downtime(name: str, range: str = "7d") -> dict:
    range_s = wan_svc.parse_range(range)
    intervals = await wan_svc.get_downtime_intervals(name, range_s)
    return {
        "data": intervals,
        "ts_from": int(time.time()) - range_s,
        "ts_to": int(time.time()),
        "meta": {"wan": name},
    }
