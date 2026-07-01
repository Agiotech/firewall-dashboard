from fastapi import APIRouter, Depends

from ..auth import require_basic_auth
from .endpoints import (
    alerts, anomaly, devices, dhcp, diagnostics, events, flows, geo, hardware, health,
    heatmaps, lan, quality, security, system, vpn, wan,
)

api_router = APIRouter(prefix="/api", dependencies=[Depends(require_basic_auth)])
api_router.include_router(health.router, tags=["health"])
api_router.include_router(wan.router, tags=["wan"])
api_router.include_router(lan.router, tags=["lan"])
api_router.include_router(system.router, tags=["system"])
api_router.include_router(events.router, tags=["events"])
api_router.include_router(alerts.router, tags=["alerts"])
api_router.include_router(quality.router, tags=["quality"])
api_router.include_router(heatmaps.router, tags=["heatmaps"])
api_router.include_router(flows.router, tags=["flows"])
api_router.include_router(devices.router, tags=["devices"])
api_router.include_router(dhcp.router, tags=["dhcp"])
api_router.include_router(vpn.router, tags=["vpn"])
api_router.include_router(geo.router, tags=["geo"])
api_router.include_router(security.router, tags=["security"])
api_router.include_router(anomaly.router, tags=["anomaly"])
api_router.include_router(hardware.router, tags=["hardware"])
api_router.include_router(diagnostics.router, tags=["diagnostics"])
