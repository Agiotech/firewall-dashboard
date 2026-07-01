"""Static catalog of entities synced to Agio-Hub (spec: docs/specs/agio-hub-middleware.md §2b).

Mirror of snmp/oids.py: constants only, no queries. Adding a fase-2 entity means
adding one SyncEntity here — the sync orchestrator and DB layer are generic.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SyncEntity:
    """One table pushed incrementally to the Hub via a (cursor, rowid) watermark."""

    name: str           # entity name in the Hub payload and in hub_sync_state
    table: str          # source table in SQLite
    cursor_column: str  # monotonic column the watermark advances on


ENTITIES: tuple[SyncEntity, ...] = (
    SyncEntity(name="wan_metrics", table="wan_metrics", cursor_column="ts"),
    SyncEntity(name="system_metrics", table="system_metrics", cursor_column="ts"),
    SyncEntity(name="events", table="events", cursor_column="id"),
    SyncEntity(name="wan_status_changes", table="wan_status_changes", cursor_column="id"),
    # upsert table: last_seen moves on every update, so changed tunnels re-emit
    SyncEntity(name="vpn_tunnels", table="vpn_tunnels", cursor_column="last_seen"),
    SyncEntity(name="internet_quality", table="internet_quality", cursor_column="ts"),
)

ENTITY_NAMES: tuple[str, ...] = tuple(e.name for e in ENTITIES)
