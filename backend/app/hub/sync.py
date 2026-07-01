"""Sync orchestrator: store-and-forward from local SQLite to Agio-Hub.

Mirror of snmp/poller.py: coordinates reads, pushes and watermarks — the HTTP
wire lives in hub/client.py, the cursors in cache/database.py. Policy per
docs/specs/agio-hub-middleware.md §2e: the watermark only advances on a
confirmed 200, failures back off exponentially, and a bad token stops the
whole cycle (it is shared by every entity). Everything is injected here;
settings/HUB_* wiring arrives with the scheduler job in inc 5.
"""
from __future__ import annotations

import logging
import time

from ..cache import database as db
from .client import HubClient, PushStatus
from .entities import ENTITIES, SyncEntity

log = logging.getLogger(__name__)

AUTH_ERROR_MESSAGE = "Token de Agio-Hub inválido, requiere renovación manual"


async def sync_once(
    client: HubClient, batch_size: int = 500, max_backoff_s: int = 900
) -> dict[str, int]:
    """Run one sync cycle over the fase-1 catalog.

    Returns rows confirmed by the Hub per attempted entity. Entities inside
    their backoff window are skipped without an attempt.
    """
    pushed: dict[str, int] = {}
    for entity in ENTITIES:
        state = await db.get_sync_watermark(entity.name)
        if _in_backoff(state, max_backoff_s, now=int(time.time())):
            continue
        count, token_ok = await _sync_entity(client, entity, state, batch_size)
        pushed[entity.name] = count
        if not token_ok:
            break
    return pushed


def _in_backoff(state: dict, max_backoff_s: int, now: int) -> bool:
    failures = state["consecutive_failures"]
    last_attempt = state["last_attempt_ts"]
    if not failures or not last_attempt:
        return False
    return now - last_attempt < min(2**failures, max_backoff_s)


async def _sync_entity(
    client: HubClient, entity: SyncEntity, state: dict, batch_size: int
) -> tuple[int, bool]:
    """Drain one entity's backlog in order. Returns (rows confirmed, token still valid)."""
    limit = batch_size  # a 413 halves it for the rest of this cycle only
    last_ts, last_id = state["last_ts"], state["last_id"]
    total = 0
    while True:
        rows = await db.read_rows_since(
            entity.table, entity.cursor_column, last_ts, last_id, limit
        )
        if not rows:
            return total, True
        payload = [{k: v for k, v in row.items() if k != "_rowid"} for row in rows]
        result = await client.push(entity.name, payload)
        now = int(time.time())

        if result.ok:
            last_ts = rows[-1][entity.cursor_column]
            last_id = rows[-1]["_rowid"]
            await db.set_sync_watermark(
                entity.name, ok=True, now_ts=now, last_ts=last_ts, last_id=last_id
            )
            total += len(rows)
            if len(rows) < limit:
                return total, True
            continue

        if result.status is PushStatus.BATCH_TOO_LARGE and limit > 1:
            limit //= 2
            await _record_monitor_event(
                now,
                f"Agio-Hub rechazó el lote de {entity.name} por tamaño (413); "
                f"se reintenta con lotes de {limit}",
            )
            continue

        error = f"{result.status.value} (HTTP {result.http_status}): {result.error}"
        await db.set_sync_watermark(entity.name, ok=False, now_ts=now, error=error)

        if result.status is PushStatus.AUTH_ERROR:
            await _record_monitor_event(now, AUTH_ERROR_MESSAGE, priority="error")
            return total, False
        if result.status in (PushStatus.REJECTED, PushStatus.BATCH_TOO_LARGE):
            # contrato roto (422) o 413 con lote ya de 1 fila: reintentar no ayuda
            await _record_monitor_event(
                now, f"Agio-Hub rechazó el lote de {entity.name}: {error}", priority="error"
            )
            return total, True
        log.warning("Hub sync %s transient failure: %s", entity.name, error)
        return total, True


async def _record_monitor_event(ts: int, msg: str, priority: str = "warning") -> None:
    await db.insert_event(
        ts=ts,
        priority=priority,
        category="monitor",
        message=msg,
        src_ip=None, src_port=None, dst_ip=None, dst_port=None,
        action=None, note=None,
    )
