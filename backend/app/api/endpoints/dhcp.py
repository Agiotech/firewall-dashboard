import time

from fastapi import APIRouter, HTTPException, Request

from ...services import dhcp as dhcp_svc

router = APIRouter()


@router.get("/dhcp")
async def list_dhcp(limit: int = 1000, q: str | None = None) -> dict:
    limit = max(1, min(limit, 5000))
    data = await dhcp_svc.list_reservations(limit)
    if q:
        ql = q.lower()
        data = [
            r for r in data
            if ql in (r.get("ip") or "").lower()
            or ql in (r.get("mac") or "").lower()
            or ql in (r.get("hostname") or "").lower()
            or ql in (r.get("description") or "").lower()
        ]
    return {"data": data, "count": len(data), "ts": int(time.time())}


@router.get("/dhcp/{ip}")
async def get_dhcp(ip: str) -> dict:
    r = await dhcp_svc.lookup(ip)
    if not r:
        raise HTTPException(status_code=404, detail="not found")
    return r


@router.post("/dhcp/import")
async def import_dhcp(request: Request, source: str = "manual") -> dict:
    """Accept a CSV body (text/csv or text/plain) or a JSON array of records.

    CSV expected headers (any of): IP Address, MAC Address, Host Name, Description, VLAN ID, Interface, Status.
    Header names are matched case-insensitively with aliases.
    """
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="empty body")

    try:
        if content_type == "application/json":
            import json as _json
            records = _json.loads(body.decode("utf-8"))
            if not isinstance(records, list):
                raise HTTPException(status_code=400, detail="JSON must be an array of records")
        else:
            text = body.decode("utf-8-sig", errors="replace")
            records = dhcp_svc.parse_csv(text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    n = await dhcp_svc.import_records(records, source=source)
    return {"imported": n, "received": len(records), "source": source, "ts": int(time.time())}


@router.delete("/dhcp/{ip}")
async def delete_dhcp(ip: str) -> dict:
    deleted = await dhcp_svc.delete_one(ip)
    if not deleted:
        raise HTTPException(status_code=404, detail="not found")
    return {"deleted": ip}


@router.get("/dhcp/_/stats")
async def dhcp_stats() -> dict:
    return {"count": await dhcp_svc.count(), "ts": int(time.time())}
