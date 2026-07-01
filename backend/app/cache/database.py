import re

import aiosqlite
from pathlib import Path
from contextlib import asynccontextmanager
from ..config import settings
from ..hub.entities import ENTITIES, SyncEntity


SCHEMA = """
CREATE TABLE IF NOT EXISTS wan_metrics (
    ts          INTEGER NOT NULL,
    wan_name    TEXT    NOT NULL,
    oper_status INTEGER,
    bps_in      REAL,
    bps_out     REAL,
    pps_in      REAL,
    pps_out     REAL,
    PRIMARY KEY (ts, wan_name)
);

CREATE INDEX IF NOT EXISTS idx_wan_metrics_ts ON wan_metrics(ts);

CREATE TABLE IF NOT EXISTS system_metrics (
    ts          INTEGER PRIMARY KEY,
    cpu_pct     REAL,
    mem_pct     REAL,
    sessions    INTEGER,
    uptime_sec  INTEGER
);

CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          INTEGER NOT NULL,
    priority    TEXT,
    category    TEXT,
    message     TEXT,
    src_ip      TEXT,
    src_port    INTEGER,
    dst_ip      TEXT,
    dst_port    INTEGER,
    action      TEXT,
    note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_pri ON events(priority);
CREATE INDEX IF NOT EXISTS idx_events_cat ON events(category);

CREATE TABLE IF NOT EXISTS wan_status_changes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          INTEGER NOT NULL,
    wan_name    TEXT NOT NULL,
    new_status  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wan_changes_ts ON wan_status_changes(ts);

CREATE TABLE IF NOT EXISTS internet_quality (
    ts          INTEGER NOT NULL,
    target      TEXT    NOT NULL,
    latency_ms  REAL,
    jitter_ms   REAL,
    loss_pct    REAL,
    PRIMARY KEY (ts, target)
);

CREATE INDEX IF NOT EXISTS idx_quality_ts ON internet_quality(ts);

CREATE TABLE IF NOT EXISTS wan_metrics_5m (
    ts          INTEGER NOT NULL,
    wan_name    TEXT    NOT NULL,
    oper_pct    REAL,
    bps_in_avg  REAL,
    bps_in_max  REAL,
    bps_out_avg REAL,
    bps_out_max REAL,
    PRIMARY KEY (ts, wan_name)
);

CREATE INDEX IF NOT EXISTS idx_wan_5m_ts ON wan_metrics_5m(ts);

CREATE TABLE IF NOT EXISTS lan_metrics (
    ts          INTEGER NOT NULL,
    port_name   TEXT    NOT NULL,
    oper_status INTEGER,
    bps_in      REAL,
    bps_out     REAL,
    errors_in   REAL,
    errors_out  REAL,
    speed_mbps  INTEGER,
    PRIMARY KEY (ts, port_name)
);

CREATE INDEX IF NOT EXISTS idx_lan_metrics_ts ON lan_metrics(ts);

CREATE TABLE IF NOT EXISTS flow_aggregates (
    ts_bucket   INTEGER NOT NULL,
    src_ip      TEXT    NOT NULL,
    dst_ip      TEXT    NOT NULL,
    bytes       INTEGER NOT NULL DEFAULT 0,
    packets     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (ts_bucket, src_ip, dst_ip)
);

CREATE INDEX IF NOT EXISTS idx_flows_ts ON flow_aggregates(ts_bucket);
CREATE INDEX IF NOT EXISTS idx_flows_src ON flow_aggregates(src_ip);
CREATE INDEX IF NOT EXISTS idx_flows_dst ON flow_aggregates(dst_ip);

CREATE TABLE IF NOT EXISTS devices (
    ip            TEXT PRIMARY KEY,
    mac           TEXT,
    vendor        TEXT,
    hostname      TEXT,
    sys_descr     TEXT,
    device_type   TEXT,
    snmp_ok       INTEGER DEFAULT 0,
    first_seen    INTEGER NOT NULL,
    last_seen     INTEGER NOT NULL,
    if_index_fw   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(device_type);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);

CREATE TABLE IF NOT EXISTS device_metrics (
    ts         INTEGER NOT NULL,
    ip         TEXT    NOT NULL,
    cpu_pct    REAL,
    mem_pct    REAL,
    uptime_sec INTEGER,
    PRIMARY KEY (ts, ip)
);

CREATE INDEX IF NOT EXISTS idx_device_metrics_ts ON device_metrics(ts);

CREATE TABLE IF NOT EXISTS dhcp_reservations (
    ip          TEXT PRIMARY KEY,
    mac         TEXT,
    hostname    TEXT,
    description TEXT,
    vlan        TEXT,
    interface   TEXT,
    status      TEXT,
    source      TEXT NOT NULL DEFAULT 'manual',
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dhcp_mac ON dhcp_reservations(mac);
CREATE INDEX IF NOT EXISTS idx_dhcp_hostname ON dhcp_reservations(hostname);

CREATE TABLE IF NOT EXISTS vpn_tunnels (
    name           TEXT PRIMARY KEY,
    peer_ip        TEXT,
    local_ip       TEXT,
    state          TEXT,
    last_event_msg TEXT,
    last_event_ts  INTEGER,
    last_dpd_ts    INTEGER,
    dpd_count      INTEGER DEFAULT 0,
    rekeys         INTEGER DEFAULT 0,
    first_seen     INTEGER NOT NULL,
    last_seen      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vpn_tunnels_state ON vpn_tunnels(state);
CREATE INDEX IF NOT EXISTS idx_vpn_tunnels_last_seen ON vpn_tunnels(last_seen);

CREATE TABLE IF NOT EXISTS vpn_client_sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT,
    src_ip        TEXT,
    assigned_ip   TEXT,
    vpn_type      TEXT,
    started_at    INTEGER NOT NULL,
    ended_at      INTEGER,
    last_seen_ts  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vpn_client_user ON vpn_client_sessions(username);
CREATE INDEX IF NOT EXISTS idx_vpn_client_started ON vpn_client_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_vpn_client_active ON vpn_client_sessions(ended_at);

CREATE TABLE IF NOT EXISTS geoip_cache (
    ip           TEXT PRIMARY KEY,
    country      TEXT,
    country_code TEXT,
    region       TEXT,
    city         TEXT,
    lat          REAL,
    lon          REAL,
    isp          TEXT,
    org          TEXT,
    asn          TEXT,
    cached_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_geoip_country ON geoip_cache(country_code);
CREATE INDEX IF NOT EXISTS idx_geoip_cached ON geoip_cache(cached_at);

CREATE TABLE IF NOT EXISTS hardware_metrics (
    ts    INTEGER NOT NULL,
    kind  TEXT NOT NULL,
    name  TEXT NOT NULL,
    value REAL,
    unit  TEXT,
    PRIMARY KEY (ts, kind, name)
);

CREATE INDEX IF NOT EXISTS idx_hardware_ts ON hardware_metrics(ts);

CREATE TABLE IF NOT EXISTS hub_sync_state (
    entity                TEXT PRIMARY KEY,
    last_ts               INTEGER NOT NULL DEFAULT 0,
    last_id               INTEGER NOT NULL DEFAULT 0,
    last_attempt_ts       INTEGER,
    last_success_ts       INTEGER,
    consecutive_failures  INTEGER NOT NULL DEFAULT 0,
    last_error            TEXT
);
"""


async def init_db() -> None:
    Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA synchronous=NORMAL")
        await db.executescript(SCHEMA)
        await db.commit()


@asynccontextmanager
async def get_db():
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        yield db


async def insert_wan_metric(ts: int, wan: str, status: int, bps_in: float, bps_out: float, pps_in: float = 0, pps_out: float = 0) -> None:
    async with get_db() as db:
        await db.execute(
            "INSERT OR REPLACE INTO wan_metrics(ts, wan_name, oper_status, bps_in, bps_out, pps_in, pps_out) VALUES (?,?,?,?,?,?,?)",
            (ts, wan, status, bps_in, bps_out, pps_in, pps_out),
        )
        await db.commit()


async def insert_system_metric(ts: int, cpu: float, mem: float, sessions: int, uptime: int) -> None:
    async with get_db() as db:
        await db.execute(
            "INSERT OR REPLACE INTO system_metrics(ts, cpu_pct, mem_pct, sessions, uptime_sec) VALUES (?,?,?,?,?)",
            (ts, cpu, mem, sessions, uptime),
        )
        await db.commit()


async def insert_event(ts: int, priority: str, category: str, message: str,
                       src_ip: str | None, src_port: int | None,
                       dst_ip: str | None, dst_port: int | None,
                       action: str | None, note: str | None) -> None:
    async with get_db() as db:
        await db.execute(
            "INSERT INTO events(ts, priority, category, message, src_ip, src_port, dst_ip, dst_port, action, note) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (ts, priority, category, message, src_ip, src_port, dst_ip, dst_port, action, note),
        )
        await db.commit()


async def insert_status_change(ts: int, wan: str, status: int) -> None:
    async with get_db() as db:
        await db.execute(
            "INSERT INTO wan_status_changes(ts, wan_name, new_status) VALUES (?,?,?)",
            (ts, wan, status),
        )
        await db.commit()


async def insert_lan_metric(
    ts: int, port: str, oper_status: int,
    bps_in: float, bps_out: float, errors_in: float, errors_out: float, speed_mbps: int,
) -> None:
    async with get_db() as db:
        await db.execute(
            "INSERT OR REPLACE INTO lan_metrics"
            "(ts, port_name, oper_status, bps_in, bps_out, errors_in, errors_out, speed_mbps)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (ts, port, oper_status, bps_in, bps_out, errors_in, errors_out, speed_mbps),
        )
        await db.commit()


async def upsert_flow_bulk(
    rows: list[tuple[int, str, str, int, int]],
) -> None:
    """Bulk insert/accumulate flow aggregates.
    rows: list of (ts_bucket, src_ip, dst_ip, bytes_delta, packets_delta).
    """
    if not rows:
        return
    async with get_db() as db:
        await db.executemany(
            """
            INSERT INTO flow_aggregates(ts_bucket, src_ip, dst_ip, bytes, packets)
            VALUES (?,?,?,?,?)
            ON CONFLICT(ts_bucket, src_ip, dst_ip) DO UPDATE SET
                bytes = bytes + excluded.bytes,
                packets = packets + excluded.packets
            """,
            rows,
        )
        await db.commit()


async def upsert_device(
    ip: str, mac: str | None, vendor: str | None, hostname: str | None,
    sys_descr: str | None, device_type: str | None, snmp_ok: bool,
    if_index_fw: int | None, now_ts: int,
) -> None:
    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO devices(ip, mac, vendor, hostname, sys_descr, device_type,
                                snmp_ok, first_seen, last_seen, if_index_fw)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(ip) DO UPDATE SET
                mac = COALESCE(excluded.mac, mac),
                vendor = COALESCE(excluded.vendor, vendor),
                hostname = COALESCE(excluded.hostname, hostname),
                sys_descr = COALESCE(excluded.sys_descr, sys_descr),
                device_type = COALESCE(excluded.device_type, device_type),
                snmp_ok = excluded.snmp_ok,
                if_index_fw = COALESCE(excluded.if_index_fw, if_index_fw),
                last_seen = excluded.last_seen
            """,
            (ip, mac, vendor, hostname, sys_descr, device_type,
             1 if snmp_ok else 0, now_ts, now_ts, if_index_fw),
        )
        await db.commit()


async def upsert_geoip(ip: str, info: dict, ts: int) -> None:
    async with get_db() as db:
        await db.execute(
            "INSERT OR REPLACE INTO geoip_cache"
            "(ip, country, country_code, region, city, lat, lon, isp, org, asn, cached_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                ip,
                info.get("country"), info.get("countryCode"),
                info.get("regionName") or info.get("region"),
                info.get("city"), info.get("lat"), info.get("lon"),
                info.get("isp"), info.get("org"), info.get("as"),
                ts,
            ),
        )
        await db.commit()


async def get_geoip(ip: str) -> dict | None:
    async with get_db() as db:
        cur = await db.execute(
            "SELECT ip, country, country_code, region, city, lat, lon, isp, org, asn, cached_at "
            "FROM geoip_cache WHERE ip = ?",
            (ip,),
        )
        row = await cur.fetchone()
        return dict(row) if row else None


async def get_geoip_bulk(ips: list[str]) -> dict[str, dict]:
    if not ips:
        return {}
    placeholders = ",".join("?" for _ in ips)
    async with get_db() as db:
        cur = await db.execute(
            f"SELECT ip, country, country_code, region, city, lat, lon, isp, org, asn, cached_at "
            f"FROM geoip_cache WHERE ip IN ({placeholders})",
            tuple(ips),
        )
        rows = await cur.fetchall()
        return {r["ip"]: dict(r) for r in rows}


async def insert_hardware_metric(ts: int, kind: str, name: str, value: float | None, unit: str | None = None) -> None:
    async with get_db() as db:
        await db.execute(
            "INSERT OR REPLACE INTO hardware_metrics(ts, kind, name, value, unit) VALUES (?,?,?,?,?)",
            (ts, kind, name, value, unit),
        )
        await db.commit()


async def upsert_vpn_tunnel(
    name: str, peer_ip: str | None, local_ip: str | None, state: str | None,
    last_event_msg: str | None, ts: int, dpd_seen: bool = False, rekey_seen: bool = False,
) -> None:
    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO vpn_tunnels(name, peer_ip, local_ip, state, last_event_msg,
                                    last_event_ts, last_dpd_ts, dpd_count, rekeys,
                                    first_seen, last_seen)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(name) DO UPDATE SET
                peer_ip = COALESCE(excluded.peer_ip, peer_ip),
                local_ip = COALESCE(excluded.local_ip, local_ip),
                state = COALESCE(excluded.state, state),
                last_event_msg = excluded.last_event_msg,
                last_event_ts = excluded.last_event_ts,
                last_dpd_ts = CASE WHEN ? THEN excluded.last_dpd_ts ELSE last_dpd_ts END,
                dpd_count = dpd_count + CASE WHEN ? THEN 1 ELSE 0 END,
                rekeys = rekeys + CASE WHEN ? THEN 1 ELSE 0 END,
                last_seen = excluded.last_seen
            """,
            (
                name, peer_ip, local_ip, state, last_event_msg, ts,
                ts if dpd_seen else None,
                1 if dpd_seen else 0,
                1 if rekey_seen else 0,
                ts, ts,
                1 if dpd_seen else 0,
                1 if dpd_seen else 0,
                1 if rekey_seen else 0,
            ),
        )
        await db.commit()


async def open_or_update_vpn_session(
    username: str | None, src_ip: str | None, vpn_type: str | None,
    assigned_ip: str | None, ts: int,
) -> None:
    """Insert/refresh an active VPN client session keyed by (username, src_ip)."""
    if not username and not src_ip:
        return
    async with get_db() as db:
        cur = await db.execute(
            "SELECT id FROM vpn_client_sessions "
            "WHERE username IS ? AND src_ip IS ? AND ended_at IS NULL "
            "ORDER BY started_at DESC LIMIT 1",
            (username, src_ip),
        )
        row = await cur.fetchone()
        if row:
            await db.execute(
                "UPDATE vpn_client_sessions SET last_seen_ts = ?, "
                "vpn_type = COALESCE(?, vpn_type), assigned_ip = COALESCE(?, assigned_ip) "
                "WHERE id = ?",
                (ts, vpn_type, assigned_ip, row["id"]),
            )
        else:
            await db.execute(
                "INSERT INTO vpn_client_sessions(username, src_ip, assigned_ip, vpn_type, "
                "started_at, last_seen_ts) VALUES (?,?,?,?,?,?)",
                (username, src_ip, assigned_ip, vpn_type, ts, ts),
            )
        await db.commit()


async def close_vpn_session(username: str | None, src_ip: str | None, ts: int) -> None:
    async with get_db() as db:
        await db.execute(
            "UPDATE vpn_client_sessions SET ended_at = ?, last_seen_ts = ? "
            "WHERE username IS ? AND src_ip IS ? AND ended_at IS NULL",
            (ts, ts, username, src_ip),
        )
        await db.commit()


async def upsert_dhcp_reservation(
    ip: str, mac: str | None, hostname: str | None, description: str | None,
    vlan: str | None, interface: str | None, status: str | None, source: str, now_ts: int,
) -> None:
    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO dhcp_reservations
                (ip, mac, hostname, description, vlan, interface, status, source, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(ip) DO UPDATE SET
                mac = COALESCE(excluded.mac, mac),
                hostname = COALESCE(excluded.hostname, hostname),
                description = COALESCE(excluded.description, description),
                vlan = COALESCE(excluded.vlan, vlan),
                interface = COALESCE(excluded.interface, interface),
                status = COALESCE(excluded.status, status),
                source = excluded.source,
                updated_at = excluded.updated_at
            """,
            (ip, mac, hostname, description, vlan, interface, status, source, now_ts),
        )
        await db.commit()


async def insert_device_metric(ts: int, ip: str, cpu_pct: float | None,
                               mem_pct: float | None, uptime_sec: int | None) -> None:
    async with get_db() as db:
        await db.execute(
            "INSERT OR REPLACE INTO device_metrics(ts, ip, cpu_pct, mem_pct, uptime_sec) VALUES (?,?,?,?,?)",
            (ts, ip, cpu_pct, mem_pct, uptime_sec),
        )
        await db.commit()


async def insert_quality(ts: int, target: str, latency_ms: float, jitter_ms: float, loss_pct: float) -> None:
    async with get_db() as db:
        await db.execute(
            "INSERT OR REPLACE INTO internet_quality(ts, target, latency_ms, jitter_ms, loss_pct) VALUES (?,?,?,?,?)",
            (ts, target, latency_ms, jitter_ms, loss_pct),
        )
        await db.commit()


_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _safe_identifier(name: str) -> str:
    # table/column names come from the static catalog in app/hub/entities.py,
    # never from the API; this guard keeps the f-string SQL below honest.
    if not _IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid SQL identifier: {name!r}")
    return name


async def get_sync_watermark(entity: str) -> dict:
    """Return the sync cursor for an entity, creating the default row if missing."""
    async with get_db() as db:
        await db.execute(
            "INSERT OR IGNORE INTO hub_sync_state(entity) VALUES (?)", (entity,)
        )
        await db.commit()
        cur = await db.execute(
            "SELECT entity, last_ts, last_id, last_attempt_ts, last_success_ts, "
            "consecutive_failures, last_error FROM hub_sync_state WHERE entity = ?",
            (entity,),
        )
        row = await cur.fetchone()
        return dict(row)


async def set_sync_watermark(
    entity: str, ok: bool, now_ts: int,
    last_ts: int | None = None, last_id: int | None = None,
    error: str | None = None,
) -> None:
    """Record a sync attempt. The cursor (last_ts/last_id) only moves when ok=True."""
    async with get_db() as db:
        if ok:
            await db.execute(
                """
                INSERT INTO hub_sync_state(entity, last_ts, last_id, last_attempt_ts,
                                           last_success_ts, consecutive_failures, last_error)
                VALUES (?,?,?,?,?,0,NULL)
                ON CONFLICT(entity) DO UPDATE SET
                    last_ts = COALESCE(excluded.last_ts, last_ts),
                    last_id = COALESCE(excluded.last_id, last_id),
                    last_attempt_ts = excluded.last_attempt_ts,
                    last_success_ts = excluded.last_success_ts,
                    consecutive_failures = 0,
                    last_error = NULL
                """,
                (entity, last_ts or 0, last_id or 0, now_ts, now_ts),
            )
        else:
            await db.execute(
                """
                INSERT INTO hub_sync_state(entity, last_attempt_ts,
                                           consecutive_failures, last_error)
                VALUES (?,?,1,?)
                ON CONFLICT(entity) DO UPDATE SET
                    last_attempt_ts = excluded.last_attempt_ts,
                    consecutive_failures = consecutive_failures + 1,
                    last_error = excluded.last_error
                """,
                (entity, now_ts, error),
            )
        await db.commit()


async def read_rows_since(
    table: str, cursor_column: str, last_ts: int, last_id: int, limit: int,
) -> list[dict]:
    """Read rows past the (cursor_value, rowid) watermark, oldest first.

    The rowid tiebreaker makes ts-cursors safe when many rows share one timestamp
    (e.g. wan_metrics has one row per WAN per poll). Each returned row includes
    `_rowid` so the caller can persist the new watermark.
    """
    t = _safe_identifier(table)
    c = _safe_identifier(cursor_column)
    async with get_db() as db:
        cur = await db.execute(
            f"SELECT rowid AS _rowid, * FROM {t} "
            f"WHERE {c} > ? OR ({c} = ? AND rowid > ?) "
            f"ORDER BY {c}, rowid LIMIT ?",
            (last_ts, last_ts, last_id, limit),
        )
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def _count_unconfirmed(db, entity: SyncEntity, purge_cutoff: int) -> int:
    """Rows about to be purged (ts < cutoff) that are past the Hub watermark."""
    t = _safe_identifier(entity.table)
    c = _safe_identifier(entity.cursor_column)
    cur = await db.execute(
        "SELECT last_ts, last_id FROM hub_sync_state WHERE entity = ?", (entity.name,)
    )
    row = await cur.fetchone()
    last_ts, last_id = (row[0], row[1]) if row else (0, 0)
    cur = await db.execute(
        f"SELECT COUNT(*) FROM {t} "
        f"WHERE ts < ? AND ({c} > ? OR ({c} = ? AND rowid > ?))",
        (purge_cutoff, last_ts, last_ts, last_id),
    )
    row = await cur.fetchone()
    return int(row[0])


async def purge_old(now_ts: int) -> None:
    cutoff = now_ts - settings.retention_days * 86400
    cutoff_5m = now_ts - 90 * 86400
    cutoff_changes = now_ts - 365 * 86400
    # cortes de purga de las tablas sincronizables (vpn_tunnels no se purga)
    sync_purge_cutoffs = {
        "wan_metrics": cutoff,
        "system_metrics": cutoff,
        "events": cutoff,
        "wan_status_changes": cutoff_changes,
        "internet_quality": cutoff,
    }
    async with get_db() as db:
        # aviso antes de perder filas que Agio-Hub aún no confirma (spec §2e);
        # sin sync activa (o en mock) todo sería "no confirmado" y solo haría ruido
        warnings: list[tuple[str, int]] = []
        if settings.hub_sync_enabled and not settings.mock_mode:
            for entity in ENTITIES:
                table_cutoff = sync_purge_cutoffs.get(entity.table)
                if table_cutoff is None:
                    continue
                n = await _count_unconfirmed(db, entity, table_cutoff)
                if n:
                    warnings.append((entity.name, n))
        await db.execute("DELETE FROM wan_metrics WHERE ts < ?", (cutoff,))
        await db.execute("DELETE FROM system_metrics WHERE ts < ?", (cutoff,))
        await db.execute("DELETE FROM events WHERE ts < ?", (cutoff,))
        await db.execute("DELETE FROM wan_status_changes WHERE ts < ?", (cutoff_changes,))
        await db.execute("DELETE FROM internet_quality WHERE ts < ?", (cutoff,))
        await db.execute("DELETE FROM wan_metrics_5m WHERE ts < ?", (cutoff_5m,))
        await db.execute("DELETE FROM lan_metrics WHERE ts < ?", (cutoff,))
        await db.execute("DELETE FROM flow_aggregates WHERE ts_bucket < ?", (now_ts - 7 * 86400,))
        for name, n in warnings:
            await db.execute(
                "INSERT INTO events(ts, priority, category, message) VALUES (?,?,?,?)",
                (now_ts, "warning", "monitor",
                 f"Se purgaron {n} filas de {name} sin confirmar por Agio-Hub"),
            )
        await db.commit()
