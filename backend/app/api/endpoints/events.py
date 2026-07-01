import time

from fastapi import APIRouter

from ...cache.database import get_db

router = APIRouter()


@router.get("/events")
async def get_events(
    priority: str | None = None,
    category: str | None = None,
    q: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    where = []
    params: list = []
    if priority:
        where.append("priority = ?")
        params.append(priority)
    if category:
        where.append("category = ?")
        params.append(category)
    if q:
        where.append("(message LIKE ? OR src_ip LIKE ? OR dst_ip LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like, like])

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    async with get_db() as db:
        cur = await db.execute(
            f"SELECT id, ts, priority, category, message, src_ip, src_port, dst_ip, dst_port, action, note "
            f"FROM events {where_sql} ORDER BY ts DESC LIMIT ? OFFSET ?",
            (*params, limit, offset),
        )
        rows = await cur.fetchall()
        events = [dict(r) for r in rows]

        cur2 = await db.execute(f"SELECT COUNT(*) AS n FROM events {where_sql}", params)
        total = (await cur2.fetchone())["n"]

    return {
        "data": events,
        "total": total,
        "limit": limit,
        "offset": offset,
        "ts": int(time.time()),
    }


@router.get("/events/top-talkers")
async def get_top_talkers(range: str = "1h", limit: int = 10) -> dict:
    range_map = {"5m": 300, "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 3600)
    since = int(time.time()) - range_s
    limit = max(1, min(limit, 50))

    async with get_db() as db:
        cur_src = await db.execute(
            "SELECT src_ip, COUNT(*) AS n FROM events "
            "WHERE ts >= ? AND src_ip IS NOT NULL AND src_ip != '' "
            "GROUP BY src_ip ORDER BY n DESC LIMIT ?",
            (since, limit),
        )
        top_src = [dict(r) for r in await cur_src.fetchall()]

        cur_dst = await db.execute(
            "SELECT dst_ip, COUNT(*) AS n FROM events "
            "WHERE ts >= ? AND dst_ip IS NOT NULL AND dst_ip != '' "
            "GROUP BY dst_ip ORDER BY n DESC LIMIT ?",
            (since, limit),
        )
        top_dst = [dict(r) for r in await cur_dst.fetchall()]

        cur_dport = await db.execute(
            "SELECT dst_port, COUNT(*) AS n FROM events "
            "WHERE ts >= ? AND dst_port IS NOT NULL "
            "GROUP BY dst_port ORDER BY n DESC LIMIT ?",
            (since, limit),
        )
        top_dport = [dict(r) for r in await cur_dport.fetchall()]

    return {"top_src": top_src, "top_dst": top_dst, "top_dst_port": top_dport, "range_s": range_s}


@router.get("/events/counts")
async def get_event_counts(range: str = "1h") -> dict:
    range_map = {"5m": 300, "1h": 3600, "24h": 86400, "7d": 604800}
    range_s = range_map.get(range, 3600)
    since = int(time.time()) - range_s
    async with get_db() as db:
        cur_pri = await db.execute(
            "SELECT priority, COUNT(*) AS n FROM events WHERE ts >= ? GROUP BY priority",
            (since,),
        )
        by_pri = {r["priority"]: r["n"] for r in await cur_pri.fetchall()}
        cur_cat = await db.execute(
            "SELECT category, COUNT(*) AS n FROM events WHERE ts >= ? GROUP BY category",
            (since,),
        )
        by_cat = {r["category"]: r["n"] for r in await cur_cat.fetchall()}
    return {"by_priority": by_pri, "by_category": by_cat, "range_s": range_s}
