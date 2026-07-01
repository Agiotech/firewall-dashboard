"""Outage forensics — reconstruct what happened in any time window.

Combines all data sources to surface gaps and anomalies that may explain
a reported outage that the alerting didn't catch.
"""
import time

from ..cache.database import get_db


SNMP_GAP_THRESHOLD_S = 90   # > 1.5 polling intervals = gap
QUALITY_GAP_THRESHOLD_S = 120
LOSS_HIGH_THRESHOLD = 50    # %


async def timeline(range_s: int) -> dict:
    """Return all observations in the window, plus detected issues."""
    now = int(time.time())
    since = now - range_s

    out: dict = {
        "ts_from": since,
        "ts_to": now,
        "range_s": range_s,
    }

    async with get_db() as db:
        # WAN status changes
        cur = await db.execute(
            "SELECT ts, wan_name, new_status FROM wan_status_changes "
            "WHERE ts >= ? ORDER BY ts ASC",
            (since,),
        )
        out["wan_changes"] = [dict(r) for r in await cur.fetchall()]

        # System metrics samples (to detect SNMP polling gaps)
        cur = await db.execute(
            "SELECT ts FROM system_metrics WHERE ts >= ? ORDER BY ts ASC",
            (since,),
        )
        sys_ts = [int(r["ts"]) for r in await cur.fetchall()]
        out["snmp_sample_count"] = len(sys_ts)

        # Quality samples per target
        cur = await db.execute(
            "SELECT ts, target, latency_ms, loss_pct FROM internet_quality "
            "WHERE ts >= ? ORDER BY ts ASC",
            (since,),
        )
        quality_rows = [dict(r) for r in await cur.fetchall()]
        out["quality"] = quality_rows

        # Connectivity Check events from syslog
        cur = await db.execute(
            "SELECT ts, message, src_ip, dst_ip FROM events "
            "WHERE ts >= ? AND category = 'Connectivity Check' ORDER BY ts ASC",
            (since,),
        )
        out["connectivity_events"] = [dict(r) for r in await cur.fetchall()]

        # Monitor events (poller failures, etc.)
        cur = await db.execute(
            "SELECT ts, priority, message FROM events "
            "WHERE ts >= ? AND category = 'monitor' ORDER BY ts ASC",
            (since,),
        )
        out["monitor_events"] = [dict(r) for r in await cur.fetchall()]

        # Event counts per minute by category (for heat-band visualization)
        cur = await db.execute(
            "SELECT (ts / 60) * 60 AS bucket_ts, category, COUNT(*) AS n "
            "FROM events WHERE ts >= ? GROUP BY bucket_ts, category "
            "ORDER BY bucket_ts ASC",
            (since,),
        )
        out["events_per_min"] = [dict(r) for r in await cur.fetchall()]

    # Detect issues
    issues: list[dict] = []

    # 1. SNMP gaps
    if sys_ts:
        prev = sys_ts[0]
        for t in sys_ts[1:]:
            gap = t - prev
            if gap > SNMP_GAP_THRESHOLD_S:
                issues.append({
                    "kind": "snmp_gap",
                    "severity": "high",
                    "from_ts": prev,
                    "to_ts": t,
                    "duration_s": gap,
                    "message": (
                        f"Sin métricas SNMP por {gap // 60}m {gap % 60}s — "
                        "el poller no recibió respuesta del firewall."
                    ),
                })
            prev = t
    else:
        issues.append({
            "kind": "no_snmp",
            "severity": "high",
            "from_ts": since,
            "to_ts": now,
            "duration_s": range_s,
            "message": "Sin ninguna muestra SNMP en este rango. ¿Está el firewall reachable? ¿MOCK_MODE=false?",
        })

    # 2. Quality probe gaps per target
    by_target: dict[str, list[int]] = {}
    for r in quality_rows:
        by_target.setdefault(r["target"], []).append(int(r["ts"]))
    for target, ts_list in by_target.items():
        ts_list.sort()
        if not ts_list:
            continue
        prev = ts_list[0]
        for t in ts_list[1:]:
            gap = t - prev
            if gap > QUALITY_GAP_THRESHOLD_S:
                issues.append({
                    "kind": "quality_gap",
                    "severity": "medium",
                    "from_ts": prev,
                    "to_ts": t,
                    "duration_s": gap,
                    "target": target,
                    "message": (
                        f"Sin ping a {target} por {gap // 60}m — "
                        "tu PC no pudo alcanzar el destino."
                    ),
                })
            prev = t

    # 3. Sustained high loss per target (>= 50% loss in consecutive samples)
    for target, ts_list in by_target.items():
        target_rows = [r for r in quality_rows if r["target"] == target]
        target_rows.sort(key=lambda r: r["ts"])
        run_start: int | None = None
        run_count = 0
        for r in target_rows:
            if (r.get("loss_pct") or 0) >= LOSS_HIGH_THRESHOLD:
                if run_start is None:
                    run_start = int(r["ts"])
                run_count += 1
            else:
                if run_start is not None and run_count >= 3:
                    issues.append({
                        "kind": "high_loss",
                        "severity": "high",
                        "from_ts": run_start,
                        "to_ts": int(r["ts"]),
                        "duration_s": int(r["ts"]) - run_start,
                        "target": target,
                        "samples": run_count,
                        "message": (
                            f"Pérdida ≥ {LOSS_HIGH_THRESHOLD}% sostenida hacia {target} "
                            f"durante {(int(r['ts']) - run_start) // 60}m."
                        ),
                    })
                run_start = None
                run_count = 0
        # Tail: ongoing run at end of window
        if run_start is not None and run_count >= 3:
            issues.append({
                "kind": "high_loss",
                "severity": "high",
                "from_ts": run_start,
                "to_ts": int(target_rows[-1]["ts"]),
                "duration_s": int(target_rows[-1]["ts"]) - run_start,
                "target": target,
                "samples": run_count,
                "message": (
                    f"Pérdida ≥ {LOSS_HIGH_THRESHOLD}% hacia {target} continúa al final "
                    "del rango (no se ha recuperado)."
                ),
            })

    # 4. WAN flapping (>= 3 changes in 10 min)
    flap_windows: dict[str, list[int]] = {}
    for ch in out["wan_changes"]:
        flap_windows.setdefault(ch["wan_name"], []).append(int(ch["ts"]))
    for wan, changes in flap_windows.items():
        for i, t in enumerate(changes):
            window_count = sum(1 for x in changes if t <= x < t + 600)
            if window_count >= 3:
                issues.append({
                    "kind": "flapping",
                    "severity": "medium",
                    "from_ts": t,
                    "to_ts": t + 600,
                    "wan": wan,
                    "changes": window_count,
                    "message": (
                        f"{wan} flapeó {window_count} veces en 10 min — "
                        "enlace inestable."
                    ),
                })
                break  # only report once per WAN

    # 5. No quality probes at all
    if not quality_rows and range_s >= 600:
        issues.append({
            "kind": "no_quality",
            "severity": "high",
            "from_ts": since,
            "to_ts": now,
            "duration_s": range_s,
            "message": (
                "El ping prober no ha registrado NINGUNA muestra. "
                "Verifica QUALITY_CHECK_ENABLED en .env y que tu PC pueda hacer ping al exterior."
            ),
        })

    # Sort issues chronologically
    issues.sort(key=lambda x: x.get("from_ts", 0))
    out["issues"] = issues
    out["issue_count_by_severity"] = {
        "high": sum(1 for i in issues if i["severity"] == "high"),
        "medium": sum(1 for i in issues if i["severity"] == "medium"),
    }

    return out
