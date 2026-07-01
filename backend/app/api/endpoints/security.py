import time

from fastapi import APIRouter, Response

from ...services import blocklist as bl_svc
from ...services import geoip as geo_svc
from ...services import security as sec_svc

router = APIRouter()


@router.get("/security/attacks")
async def get_attacks(range: str = "24h", limit: int = 50) -> dict:
    range_map = {"1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 86400)
    data = await sec_svc.attack_summary(range_s, limit)
    # Enrich with GeoIP
    if data:
        geo = await geo_svc.lookup_many([r["src_ip"] for r in data])
        for r in data:
            g = geo.get(r["src_ip"]) or {}
            r["country"] = g.get("country")
            r["country_code"] = g.get("country_code")
            r["city"] = g.get("city")
            r["isp"] = g.get("isp")
    timeline = await sec_svc.attack_timeline_buckets(range_s)
    summary = {"attack": 0, "scan": 0, "service": 0, "noise": 0}
    for r in data:
        summary[r.get("category", "noise")] = summary.get(r.get("category", "noise"), 0) + 1
    return {
        "data": data, "timeline": timeline, "summary": summary,
        "range_s": range_s, "ts": int(time.time()),
    }


@router.get("/security/attackers/{src_ip}")
async def get_attacker_detail(src_ip: str, range: str = "24h") -> dict:
    range_map = {"1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 86400)
    attempts = await sec_svc.attacker_attempts(src_ip, range_s)
    geo = await geo_svc.lookup(src_ip)
    return {"data": attempts, "geo": geo, "ts": int(time.time())}


@router.get("/security/blocklist/export")
async def export_blocklist(
    range: str = "24h",
    category: str = "real",
    min_attempts: int = 0,
) -> Response:
    """Export classified attackers as a 4-sheet .xlsx ready to apply in the USG.

    Sheets:
      - Atacantes: full per-IP detail
      - Bloqueos /24: aggregated subnets (when >= 2 attackers share /24)
      - Pegar en USG: minimal CIDR + motivo list
      - Info: metadata + step-by-step manual procedure
    """
    range_map = {"1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 86400)
    valid_cats = {"real", "attack", "scan", "service", "noise", "all"}
    if category not in valid_cats:
        category = "real"
    min_attempts = max(0, min(int(min_attempts), 100000))

    content = await bl_svc.build_blocklist_xlsx(range_s, category, min_attempts)
    filename = f"blocklist-{time.strftime('%Y%m%d-%H%M')}-{category}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
