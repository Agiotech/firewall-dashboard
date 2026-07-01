from fastapi import APIRouter
from pydantic import BaseModel

from ...config import settings
from ...mock.generator import mock_sparkline, mock_system, mock_wans
from ...services import system as sys_svc
from ...services import wan as wan_svc

router = APIRouter()


class WanCard(BaseModel):
    name: str
    label: str
    oper_status: int
    bps_in: float
    bps_out: float
    latency_ms: float
    loss_pct: float
    link_speed_mbps: int
    sparkline: list[float]


class SystemCard(BaseModel):
    cpu_pct: float
    mem_pct: float
    sessions_total: int
    uptime_sec: int
    sparkline_cpu: list[float]
    sparkline_sessions: list[float]


class HealthResponse(BaseModel):
    mock_mode: bool
    wans: list[WanCard]
    system: SystemCard
    alerts_count: int


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    if settings.mock_mode:
        return await _health_mock()
    return await _health_real()


async def _health_mock() -> HealthResponse:
    wans_snap = mock_wans()
    sys_snap = mock_system()
    wans = [
        WanCard(
            name=w.name,
            label=w.label,
            oper_status=w.oper_status,
            bps_in=w.bps_in,
            bps_out=w.bps_out,
            latency_ms=w.latency_ms,
            loss_pct=w.loss_pct,
            link_speed_mbps=w.link_speed_mbps,
            sparkline=mock_sparkline(30, base=w.bps_in / 1_000_000, amp=10),
        )
        for w in wans_snap
    ]
    system = SystemCard(
        cpu_pct=sys_snap.cpu_pct,
        mem_pct=sys_snap.mem_pct,
        sessions_total=sys_snap.sessions_total,
        uptime_sec=sys_snap.uptime_sec,
        sparkline_cpu=mock_sparkline(30, base=12, amp=8),
        sparkline_sessions=mock_sparkline(30, base=4321, amp=800),
    )
    return HealthResponse(
        mock_mode=True,
        wans=wans,
        system=system,
        alerts_count=1 if any(w.oper_status == 0 for w in wans_snap) else 0,
    )


async def _health_real() -> HealthResponse:
    latest = {r["wan_name"]: r for r in await wan_svc.get_wan_latest()}
    wans: list[WanCard] = []
    down_count = 0
    for w in settings.wan_list:
        row = latest.get(w, {})
        oper = int(row.get("oper_status", 0))
        if oper == 0:
            down_count += 1
        wans.append(
            WanCard(
                name=w,
                label=wan_svc.wan_label(w),
                oper_status=oper,
                bps_in=float(row.get("bps_in", 0.0)),
                bps_out=float(row.get("bps_out", 0.0)),
                latency_ms=0.0,
                loss_pct=0.0,
                link_speed_mbps=1000,
                sparkline=await wan_svc.get_sparkline(w),
            )
        )

    sys_row = await sys_svc.get_latest_system() or {}
    system = SystemCard(
        cpu_pct=float(sys_row.get("cpu_pct", 0.0)),
        mem_pct=float(sys_row.get("mem_pct", 0.0)),
        sessions_total=int(sys_row.get("sessions", 0)),
        uptime_sec=int(sys_row.get("uptime_sec", 0)),
        sparkline_cpu=await sys_svc.get_sparkline("cpu_pct"),
        sparkline_sessions=await sys_svc.get_sparkline("sessions"),
    )
    return HealthResponse(mock_mode=False, wans=wans, system=system, alerts_count=down_count)


@router.get("/status")
async def get_status() -> dict:
    import time
    return {
        "mock_mode": settings.mock_mode,
        "firewall_host": settings.firewall_host,
        "now_ts": int(time.time()),
        "version": "0.1.0",
    }
