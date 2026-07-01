from fastapi import APIRouter

from ...alerts.evaluator import active_alerts

router = APIRouter()


@router.get("/alerts/active")
async def get_active_alerts() -> dict:
    return {"data": active_alerts()}
