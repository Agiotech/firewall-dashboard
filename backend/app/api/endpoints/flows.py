import time

from fastapi import APIRouter, HTTPException

from ...services import flows as flows_svc

router = APIRouter()


def _validate_direction(d: str) -> str:
    if d not in ("download", "upload"):
        raise HTTPException(status_code=400, detail="direction must be 'download' or 'upload'")
    return d


@router.get("/flows/top-lan-hosts")
async def get_top_lan_hosts(direction: str = "download", range: str = "1h", limit: int = 20) -> dict:
    direction = _validate_direction(direction)
    range_s = flows_svc.parse_range(range)
    limit = max(1, min(limit, 100))
    data = await flows_svc.top_lan_hosts(direction, range_s, limit)
    return {
        "data": data,
        "direction": direction,
        "range_s": range_s,
        "ts": int(time.time()),
    }


@router.get("/flows/top-external-ips")
async def get_top_external_ips(direction: str = "download", range: str = "1h", limit: int = 20) -> dict:
    direction = _validate_direction(direction)
    range_s = flows_svc.parse_range(range)
    limit = max(1, min(limit, 100))
    data = await flows_svc.top_external_ips(direction, range_s, limit)
    return {
        "data": data,
        "direction": direction,
        "range_s": range_s,
        "ts": int(time.time()),
    }


@router.get("/flows/totals")
async def get_flow_totals(range: str = "1h") -> dict:
    range_s = flows_svc.parse_range(range)
    return {
        "data": await flows_svc.total_bytes(range_s),
        "range_s": range_s,
    }
