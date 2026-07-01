import logging
import time

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

from ..cache import database as db
from ..config import settings
from ..alerts.evaluator import evaluate_once
from ..devices.discovery import scan_once as devices_scan
from ..mock.generator import mock_flow_rows, mock_lan_ports, mock_system, mock_wans
from ..quality.prober import probe_all
from ..services import hardware as hw_svc
from ..services import rollups
from ..snmp import poller as snmp_poller

log = logging.getLogger(__name__)


_scheduler: AsyncIOScheduler | None = None


async def _job_poll() -> None:
    try:
        if settings.mock_mode:
            await _persist_mock_tick()
        else:
            await snmp_poller.poll_once()
    except Exception as e:
        log.exception("Poll job failed: %s", e)


async def _persist_mock_tick() -> None:
    ts = int(time.time())
    sys = mock_system()
    await db.insert_system_metric(ts, sys.cpu_pct, sys.mem_pct, sys.sessions_total, sys.uptime_sec)
    for w in mock_wans():
        await db.insert_wan_metric(ts, w.name, w.oper_status, w.bps_in, w.bps_out, 0, 0)
        prev = snmp_poller.state.last_wan_status.get(w.name)
        if prev is not None and prev != w.oper_status:
            await db.insert_status_change(ts, w.name, w.oper_status)
        snmp_poller.state.last_wan_status[w.name] = w.oper_status
    for p in mock_lan_ports(settings.lan_list):
        await db.insert_lan_metric(
            ts, p.name, p.oper_status, p.bps_in, p.bps_out,
            p.errors_in, p.errors_out, p.speed_mbps,
        )
    # Mock flows (1 batch per tick into the current minute bucket)
    bucket = (ts // 60) * 60
    await db.upsert_flow_bulk(mock_flow_rows(bucket))


async def _job_retention() -> None:
    try:
        await db.purge_old(int(time.time()))
    except Exception as e:
        log.exception("Retention job failed: %s", e)


async def _job_alerts() -> None:
    try:
        await evaluate_once()
    except Exception as e:
        log.exception("Alert eval failed: %s", e)


async def _job_quality() -> None:
    try:
        await probe_all()
    except Exception as e:
        log.exception("Quality probe failed: %s", e)


async def _job_rollups() -> None:
    try:
        await rollups.rollup_5m()
    except Exception as e:
        log.exception("Rollups failed: %s", e)


async def _job_devices_scan() -> None:
    try:
        if settings.mock_mode:
            return
        summary = await devices_scan()
        log.info("Device scan: %s", summary)
    except Exception as e:
        log.exception("Device scan failed: %s", e)


async def _job_hardware_poll() -> None:
    try:
        if settings.mock_mode:
            return
        await hw_svc.poll_hardware()
    except Exception as e:
        log.exception("Hardware poll failed: %s", e)


def start_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    sched = AsyncIOScheduler()
    sched.add_job(
        _job_poll,
        IntervalTrigger(seconds=settings.poll_interval_seconds),
        id="poll_main",
        max_instances=1,
        coalesce=True,
    )
    sched.add_job(
        _job_retention,
        IntervalTrigger(hours=24),
        id="retention",
        max_instances=1,
        coalesce=True,
    )
    sched.add_job(
        _job_alerts,
        IntervalTrigger(seconds=settings.alert_eval_interval_s),
        id="alerts",
        max_instances=1,
        coalesce=True,
    )
    if settings.quality_check_enabled:
        sched.add_job(
            _job_quality,
            IntervalTrigger(seconds=settings.quality_check_interval_s),
            id="quality",
            max_instances=1,
            coalesce=True,
        )
    sched.add_job(
        _job_rollups,
        IntervalTrigger(seconds=60),
        id="rollups_5m",
        max_instances=1,
        coalesce=True,
    )
    if settings.device_scan_enabled:
        sched.add_job(
            _job_devices_scan,
            IntervalTrigger(minutes=settings.device_scan_interval_minutes),
            id="devices_scan",
            max_instances=1,
            coalesce=True,
        )
        sched.add_job(
            _job_hardware_poll,
            IntervalTrigger(minutes=5),
            id="hardware_poll",
            max_instances=1,
            coalesce=True,
        )
        # Kick off an initial scan ~30s after startup
        from datetime import datetime, timedelta
        sched.add_job(
            _job_devices_scan,
            DateTrigger(run_date=datetime.now() + timedelta(seconds=30)),
            id="devices_scan_initial",
        )
    sched.start()
    log.info(
        "Scheduler started: poll every %ss (mock=%s)",
        settings.poll_interval_seconds,
        settings.mock_mode,
    )
    _scheduler = sched
    return sched


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
