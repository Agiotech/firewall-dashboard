import logging
import time
from dataclasses import dataclass, field
from typing import Any

from ..cache import database as db
from ..config import settings
from . import oids
from .client import SnmpReadError, snmp_get, snmp_walk

log = logging.getLogger(__name__)


@dataclass
class PollerState:
    """Mutable in-memory state to compute deltas between polls."""
    last_octets_in: dict[str, int] = field(default_factory=dict)
    last_octets_out: dict[str, int] = field(default_factory=dict)
    last_pkts_in: dict[str, int] = field(default_factory=dict)
    last_pkts_out: dict[str, int] = field(default_factory=dict)
    last_ts: dict[str, float] = field(default_factory=dict)
    if_index_by_name: dict[str, int] = field(default_factory=dict)
    last_wan_status: dict[str, int] = field(default_factory=dict)
    snmp_failures: int = 0


state = PollerState()


async def discover_interfaces() -> dict[str, int]:
    """Walk ifDescr and map names (wan1, lan2, …) to ifIndex."""
    descr_map = await snmp_walk(oids.IF_DESCR)
    by_name: dict[str, int] = {}
    for oid_str, name in descr_map.items():
        try:
            idx = int(oid_str.rsplit(".", 1)[-1])
            by_name[str(name).lower()] = idx
        except ValueError:
            continue
    log.info("SNMP discovered %d interfaces", len(by_name))
    return by_name


async def poll_once() -> dict[str, Any]:
    """One polling cycle. Persists metrics and returns a summary."""
    if not state.if_index_by_name:
        try:
            state.if_index_by_name = await discover_interfaces()
        except SnmpReadError as e:
            state.snmp_failures += 1
            await _record_monitor_event(f"SNMP discovery failed: {e}")
            return {"ok": False, "error": str(e)}

    now = time.time()
    ts = int(now)

    wan_results = []
    for wan in settings.wan_list:
        idx = state.if_index_by_name.get(wan.lower())
        if idx is None:
            continue
        try:
            r = await snmp_get([
                f"{oids.IF_OPER_STATUS}.{idx}",
                f"{oids.IF_HC_IN_OCTETS}.{idx}",
                f"{oids.IF_HC_OUT_OCTETS}.{idx}",
                f"{oids.IF_HC_IN_UCAST_PKTS}.{idx}",
                f"{oids.IF_HC_OUT_UCAST_PKTS}.{idx}",
                f"{oids.IF_HIGH_SPEED}.{idx}",
            ])
        except SnmpReadError as e:
            state.snmp_failures += 1
            log.warning("SNMP get failed for %s: %s", wan, e)
            await _record_monitor_event(f"SNMP get {wan} failed: {e}")
            continue

        oper = int(r.get(f"{oids.IF_OPER_STATUS}.{idx}", 2))
        oper_up = 1 if oper == 1 else 0
        in_oct = int(r.get(f"{oids.IF_HC_IN_OCTETS}.{idx}", 0))
        out_oct = int(r.get(f"{oids.IF_HC_OUT_OCTETS}.{idx}", 0))
        in_pkt = int(r.get(f"{oids.IF_HC_IN_UCAST_PKTS}.{idx}", 0))
        out_pkt = int(r.get(f"{oids.IF_HC_OUT_UCAST_PKTS}.{idx}", 0))
        speed = int(r.get(f"{oids.IF_HIGH_SPEED}.{idx}", 0))

        bps_in = bps_out = pps_in = pps_out = 0.0
        prev_ts = state.last_ts.get(wan)
        if prev_ts is not None:
            dt = now - prev_ts
            if dt > 0:
                di = in_oct - state.last_octets_in.get(wan, in_oct)
                do = out_oct - state.last_octets_out.get(wan, out_oct)
                dpi = in_pkt - state.last_pkts_in.get(wan, in_pkt)
                dpo = out_pkt - state.last_pkts_out.get(wan, out_pkt)
                if di >= 0:
                    bps_in = di * 8 / dt
                if do >= 0:
                    bps_out = do * 8 / dt
                if dpi >= 0:
                    pps_in = dpi / dt
                if dpo >= 0:
                    pps_out = dpo / dt

        state.last_octets_in[wan] = in_oct
        state.last_octets_out[wan] = out_oct
        state.last_pkts_in[wan] = in_pkt
        state.last_pkts_out[wan] = out_pkt
        state.last_ts[wan] = now

        await db.insert_wan_metric(ts, wan, oper_up, bps_in, bps_out, pps_in, pps_out)

        prev_status = state.last_wan_status.get(wan)
        if prev_status is not None and prev_status != oper_up:
            await db.insert_status_change(ts, wan, oper_up)
            await _record_monitor_event(
                f"WAN {wan} status change: {prev_status} -> {oper_up}",
                priority="alert" if oper_up == 0 else "notice",
            )
        state.last_wan_status[wan] = oper_up

        wan_results.append({
            "wan": wan, "oper": oper_up, "bps_in": bps_in, "bps_out": bps_out, "speed_mbps": speed,
        })

    # LAN metrics
    for lan in settings.lan_list:
        idx = state.if_index_by_name.get(lan.lower())
        if idx is None:
            continue
        try:
            r = await snmp_get([
                f"{oids.IF_OPER_STATUS}.{idx}",
                f"{oids.IF_HC_IN_OCTETS}.{idx}",
                f"{oids.IF_HC_OUT_OCTETS}.{idx}",
                f"{oids.IF_IN_ERRORS}.{idx}",
                f"{oids.IF_OUT_ERRORS}.{idx}",
                f"{oids.IF_HIGH_SPEED}.{idx}",
            ])
        except SnmpReadError as e:
            log.warning("SNMP get failed for LAN %s: %s", lan, e)
            continue

        oper = int(r.get(f"{oids.IF_OPER_STATUS}.{idx}", 2))
        oper_up = 1 if oper == 1 else 0
        in_oct = int(r.get(f"{oids.IF_HC_IN_OCTETS}.{idx}", 0))
        out_oct = int(r.get(f"{oids.IF_HC_OUT_OCTETS}.{idx}", 0))
        in_err = int(r.get(f"{oids.IF_IN_ERRORS}.{idx}", 0))
        out_err = int(r.get(f"{oids.IF_OUT_ERRORS}.{idx}", 0))
        speed = int(r.get(f"{oids.IF_HIGH_SPEED}.{idx}", 0))

        prev_ts = state.last_ts.get(f"lan:{lan}")
        bps_in = bps_out = err_in_rate = err_out_rate = 0.0
        if prev_ts is not None:
            dt = now - prev_ts
            if dt > 0:
                di = in_oct - state.last_octets_in.get(f"lan:{lan}", in_oct)
                do = out_oct - state.last_octets_out.get(f"lan:{lan}", out_oct)
                if di >= 0:
                    bps_in = di * 8 / dt
                if do >= 0:
                    bps_out = do * 8 / dt
                prev_err_in = state.last_pkts_in.get(f"lan:err:{lan}", in_err)
                prev_err_out = state.last_pkts_out.get(f"lan:err:{lan}", out_err)
                if in_err >= prev_err_in:
                    err_in_rate = (in_err - prev_err_in) / dt
                if out_err >= prev_err_out:
                    err_out_rate = (out_err - prev_err_out) / dt

        state.last_octets_in[f"lan:{lan}"] = in_oct
        state.last_octets_out[f"lan:{lan}"] = out_oct
        state.last_pkts_in[f"lan:err:{lan}"] = in_err
        state.last_pkts_out[f"lan:err:{lan}"] = out_err
        state.last_ts[f"lan:{lan}"] = now

        await db.insert_lan_metric(ts, lan, oper_up, bps_in, bps_out, err_in_rate, err_out_rate, speed)

    # System metrics
    try:
        sys_r = await snmp_get([oids.SYS_UPTIME])
        uptime_ticks = int(sys_r.get(oids.SYS_UPTIME, 0))
        uptime_sec = uptime_ticks // 100

        cpu_walk = await snmp_walk(oids.HR_PROCESSOR_LOAD)
        cpus = [int(v) for v in cpu_walk.values() if isinstance(v, int)]
        cpu_pct = sum(cpus) / len(cpus) if cpus else 0.0

        size_walk = await snmp_walk(oids.HR_STORAGE_SIZE)
        used_walk = await snmp_walk(oids.HR_STORAGE_USED)
        mem_pct = 0.0
        for k, size in size_walk.items():
            if not isinstance(size, int) or size <= 0:
                continue
            idx = k.rsplit(".", 1)[-1]
            used = used_walk.get(f"{oids.HR_STORAGE_USED}.{idx}")
            if isinstance(used, int):
                pct = used / size * 100
                if 0 < pct < 100:
                    mem_pct = pct
                    break

        await db.insert_system_metric(ts, cpu_pct, mem_pct, 0, uptime_sec)
        state.snmp_failures = 0
    except SnmpReadError as e:
        state.snmp_failures += 1
        log.warning("SNMP system poll failed: %s", e)
        await _record_monitor_event(f"SNMP system poll failed: {e}")

    return {"ok": True, "wans": wan_results, "failures": state.snmp_failures}


async def _record_monitor_event(msg: str, priority: str = "warning") -> None:
    await db.insert_event(
        ts=int(time.time()),
        priority=priority,
        category="monitor",
        message=msg,
        src_ip=None, src_port=None, dst_ip=None, dst_port=None,
        action=None, note=None,
    )
