"""Verificación de los 7 escenarios BDD del spec agio-hub-middleware.md §Fase 1.

Corre offline: SQLite temporal + httpx.MockTransport. No toca red, Hub ni firewall.

Uso (desde backend/ con venv activo):
    python scripts/test_hub_sync.py
"""
import asyncio
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.config import settings
from app.cache import database as db
from app.hub import sync as hub_sync
from app.hub.client import HubClient
from app.scheduler import jobs

TMP = Path(tempfile.mkdtemp(prefix="hub_sync_test_"))
CHECKS = {"ok": 0, "fail": 0}
NOW = 100_000_000


def check(cond: bool, label: str) -> None:
    tag = "OK  " if cond else "FAIL"
    CHECKS["ok" if cond else "fail"] += 1
    print(f"[{tag}] {label}")


_db_counter = 0


async def fresh_db() -> None:
    global _db_counter
    _db_counter += 1
    settings.db_path = str(TMP / f"t{_db_counter}.db")
    await db.init_db()


async def sql(query, params=()):
    async with db.get_db() as conn:
        cur = await conn.execute(query, params)
        rows = await cur.fetchall()
        await conn.commit()
        return [dict(r) for r in rows]


class HubStub:
    """Hub falso: registra payloads; respuestas por guion, luego 200."""

    def __init__(self, script=None, dynamic=None):
        self.requests: list[dict] = []
        self.script = list(script or [])
        self.dynamic = dynamic  # callable(body) -> int | Exception

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.requests.append(body)
        action = 200
        if self.dynamic is not None:
            action = self.dynamic(body)
        elif self.script:
            action = self.script.pop(0)
        if isinstance(action, Exception):
            raise action
        if action == 200:
            return httpx.Response(200, json={"accepted": len(body["rows"])})
        return httpx.Response(action, json={"detail": "stub"})

    def client(self) -> HubClient:
        return HubClient("http://hub.test", "token-stub",
                         transport=httpx.MockTransport(self.handler))


async def seed_wans(ts_list, wans=("wan1", "wan2", "wan3")):
    for ts in ts_list:
        for w in wans:
            await db.insert_wan_metric(ts, w, 1, 1000.0, 500.0, 10, 5)


async def rewind_backoff(entity: str, seconds: int = 3600) -> None:
    await sql("UPDATE hub_sync_state SET last_attempt_ts = last_attempt_ts - ? "
              "WHERE entity = ?", (seconds, entity))


# ==========================================================================
# Escenario 1 — Sincronización habilitada transmite datos nuevos periódicamente
# ==========================================================================

async def escenario_1():
    print("\n=== Escenario 1: sync habilitada transmite datos nuevos ===")
    await fresh_db()
    await seed_wans([100, 130])
    await db.insert_system_metric(100, 10.0, 40.0, 100, 999)
    await db.insert_quality(100, "1.1.1.1", 12.0, 1.0, 0.0)

    hub = HubStub()
    async with hub.client() as client:
        pushed = await hub_sync.sync_once(client, batch_size=4)
        check(pushed["wan_metrics"] == 6 and pushed["system_metrics"] == 1
              and pushed["internet_quality"] == 1,
              "las metricas nuevas se envian en lotes")
        sizes = [len(r["rows"]) for r in hub.requests if r["entity"] == "wan_metrics"]
        seen = [(row["ts"], row["wan_name"]) for r in hub.requests
                if r["entity"] == "wan_metrics" for row in r["rows"]]
        check(sizes == [4, 2] and len(set(seen)) == 6,
              "lotes respetan batch_size; empates de ts no duplican ni pierden filas")
        check(all("_rowid" not in row for r in hub.requests for row in r["rows"]),
              "las filas viajan como columnas de la tabla origen (sin _rowid)")
        wm = await db.get_sync_watermark("wan_metrics")
        check(wm["last_ts"] == 130 and wm["consecutive_failures"] == 0,
              "el marcador avanza solo con confirmacion del Hub")

        n = len(hub.requests)
        await hub_sync.sync_once(client, batch_size=4)
        check(len(hub.requests) == n, "sin datos nuevos no se reenvia nada")

    # el job queda registrado cuando la sync esta habilitada
    settings.hub_sync_enabled = True
    settings.hub_sync_interval_s = 60
    sched = jobs.start_scheduler()
    job = sched.get_job("hub_sync")
    check(job is not None and job.trigger.interval.total_seconds() == 60,
          "job periodico registrado con HUB_SYNC_INTERVAL_S")
    jobs.stop_scheduler()
    settings.hub_sync_enabled = False


# ==========================================================================
# Escenario 2 — Agio-Hub no está disponible
# ==========================================================================

async def escenario_2():
    print("\n=== Escenario 2: Agio-Hub no disponible ===")
    await fresh_db()
    await seed_wans([100])

    def timeout(_body):
        return httpx.ConnectTimeout("connection timed out")

    hub = HubStub(dynamic=timeout)
    async with hub.client() as client:
        pushed = await hub_sync.sync_once(client, batch_size=500)
        rows = await sql("SELECT COUNT(*) AS n FROM wan_metrics")
        wm = await db.get_sync_watermark("wan_metrics")
        check(pushed["wan_metrics"] == 0 and rows[0]["n"] == 3,
              "los datos permanecen integros en el almacenamiento local")
        check(wm["last_ts"] == 0 and wm["consecutive_failures"] == 1,
              "cursor no avanza; el fallo queda contado para el backoff")

        n = len(hub.requests)
        await hub_sync.sync_once(client, batch_size=500)
        check(len(hub.requests) == n,
              "reintento con espera creciente: dentro del backoff no insiste")

    hub2 = HubStub(script=[500])  # 5xx tambien es transitorio
    async with hub2.client() as client:
        await rewind_backoff("wan_metrics")
        await hub_sync.sync_once(client, batch_size=500)
        wm = await db.get_sync_watermark("wan_metrics")
        check(wm["consecutive_failures"] == 2,
              "5xx acumula fallos (backoff exponencial con tope)")
        events = await sql("SELECT * FROM events WHERE category = 'monitor'")
        check(events == [], "errores transitorios no generan eventos (solo log)")


# ==========================================================================
# Escenario 3 — Token de aplicación inválido o revocado
# ==========================================================================

async def escenario_3():
    print("\n=== Escenario 3: token invalido o revocado ===")
    await fresh_db()
    await seed_wans([100])
    await db.insert_quality(100, "1.1.1.1", 12.0, 1.0, 0.0)

    hub = HubStub(script=[401])
    async with hub.client() as client:
        pushed = await hub_sync.sync_once(client, batch_size=500)
        check(len(hub.requests) == 1 and list(pushed) == ["wan_metrics"],
              "deja de reintentar: el ciclo se detiene (token compartido)")
        events = await sql("SELECT * FROM events WHERE category = 'monitor' "
                           "AND priority = 'error'")
        check(len(events) == 1
              and events[0]["message"] == hub_sync.AUTH_ERROR_MESSAGE,
              "evento local de prioridad error: el token debe renovarse")

    # 'el resto del dashboard sigue funcionando': el job traga la excepcion
    class Boom:
        async def __call__(self, *a, **k):
            raise RuntimeError("boom")
    original = hub_sync.sync_once
    try:
        jobs.hub_sync.sync_once = Boom()
        settings.mock_mode = False
        settings.hub_url = "http://hub.test"
        settings.hub_app_token = "tok"
        await jobs._job_hub_sync()  # no debe propagar
        check(True, "una falla del ciclo no tumba el resto del middleware")
    except Exception:
        check(False, "una falla del ciclo no tumba el resto del middleware")
    finally:
        jobs.hub_sync.sync_once = original
        settings.mock_mode = True


# ==========================================================================
# Escenario 4 — Reinicio del middleware
# ==========================================================================

async def escenario_4():
    print("\n=== Escenario 4: reinicio del middleware ===")
    await fresh_db()
    await seed_wans([100, 130])

    hub = HubStub(script=[200, 500])
    async with hub.client() as client:
        pushed = await hub_sync.sync_once(client, batch_size=3)
        check(pushed["wan_metrics"] == 3,
              "antes del 'reinicio': lote 1 confirmado, lote 2 fallo")

    # reinicio: cliente nuevo, cero estado en memoria; datos nuevos durante el arranque
    await seed_wans([160])
    await rewind_backoff("wan_metrics")
    hub2 = HubStub()
    async with hub2.client() as client:
        pushed = await hub_sync.sync_once(client, batch_size=500)
        sent = [(row["ts"], row["wan_name"]) for r in hub2.requests for row in r["rows"]]
        check(pushed["wan_metrics"] == 6 and all(ts >= 130 for ts, _ in sent),
              "retoma desde el ultimo punto confirmado (no reenvia ts=100)")
        check(len([1 for ts, _ in sent if ts == 160]) == 3,
              "no omite datos generados durante el reinicio")


# ==========================================================================
# Escenario 5 — Modo de datos sintéticos (MOCK_MODE)
# ==========================================================================

async def escenario_5():
    print("\n=== Escenario 5: MOCK_MODE no transmite datos sinteticos ===")

    class Recorder:
        def __init__(self):
            self.calls = 0
        async def __call__(self, *a, **k):
            self.calls += 1
            return {}
    rec = Recorder()
    original = hub_sync.sync_once
    try:
        jobs.hub_sync.sync_once = rec
        settings.mock_mode = True
        await jobs._job_hub_sync()
        check(rec.calls == 0, "en mock el ciclo no contacta al Hub")
    finally:
        jobs.hub_sync.sync_once = original


# ==========================================================================
# Escenario 6 — Retención local choca con datos aún no confirmados
# ==========================================================================

async def escenario_6():
    print("\n=== Escenario 6: retencion vs datos no confirmados ===")
    await fresh_db()
    old1, old2 = NOW - 40 * 86400, NOW - 35 * 86400
    await seed_wans([old1, old2, NOW - 100])
    settings.hub_sync_enabled = True
    settings.mock_mode = False
    settings.retention_days = 30
    # confirmado hasta old1 (rowid 3): las 3 filas de old2 se pierden sin confirmar
    await db.set_sync_watermark("wan_metrics", ok=True, now_ts=NOW,
                                last_ts=old1, last_id=3)
    await db.purge_old(NOW)
    warns = await sql("SELECT * FROM events WHERE category = 'monitor' "
                      "AND priority = 'warning'")
    check(len(warns) == 1 and warns[0]["message"] ==
          "Se purgaron 3 filas de wan_metrics sin confirmar por Agio-Hub",
          "evento de advertencia antes de perder datos no confirmados")
    left = await sql("SELECT COUNT(*) AS n FROM wan_metrics")
    check(left[0]["n"] == 3, "la purga si borra (el aviso no la bloquea)")

    # todo confirmado -> purga silenciosa
    await fresh_db()
    await seed_wans([old1, NOW - 100])
    await db.set_sync_watermark("wan_metrics", ok=True, now_ts=NOW,
                                last_ts=NOW, last_id=6)
    await db.purge_old(NOW)
    warns = await sql("SELECT * FROM events WHERE category = 'monitor'")
    check(warns == [], "sin filas pendientes no hay advertencia")
    settings.hub_sync_enabled = False
    settings.mock_mode = True


# ==========================================================================
# Escenario 7 — Sincronización deshabilitada (comportamiento actual)
# ==========================================================================

async def escenario_7():
    print("\n=== Escenario 7: sync deshabilitada = cero regresion ===")
    settings.hub_sync_enabled = False
    sched = jobs.start_scheduler()
    check(sched.get_job("hub_sync") is None,
          "el job ni se registra: no se contacta al Hub en ningun momento")
    jobs.stop_scheduler()

    # la purga tampoco cambia: sin sync no hay advertencias nuevas
    await fresh_db()
    await seed_wans([NOW - 40 * 86400])
    settings.mock_mode = False
    await db.purge_old(NOW)
    warns = await sql("SELECT * FROM events WHERE category = 'monitor'")
    check(warns == [], "purga identica al comportamiento previo al middleware")
    settings.mock_mode = True


# ==========================================================================
# Extra — política de errores §2e no cubierta arriba (413 y 4xx de contrato)
# ==========================================================================

def extra_alias_token():
    """Contrato v0.2: el seed del Hub escribe APP_TOKEN_FIREWALL_MONITOR_BATCH."""
    print("\n=== Extra (contrato v0.2): alias del app token ===")
    import os
    from app.config import Settings
    saved = {k: os.environ.pop(k, None)
             for k in ("HUB_APP_TOKEN", "APP_TOKEN_FIREWALL_MONITOR_BATCH")}
    try:
        os.environ["APP_TOKEN_FIREWALL_MONITOR_BATCH"] = "tok-seed"
        s = Settings(_env_file=None)
        check(s.hub_app_token == "tok-seed",
              "el nombre que escribe el seed del Hub se lee sin adaptacion")
        os.environ["HUB_APP_TOKEN"] = "tok-manual"
        s = Settings(_env_file=None)
        check(s.hub_app_token == "tok-manual",
              "HUB_APP_TOKEN gana como override manual si ambos existen")
    finally:
        for k, v in saved.items():
            os.environ.pop(k, None)
            if v is not None:
                os.environ[k] = v


async def extra_politica_errores():
    print("\n=== Extra (spec 2e): 413 y 4xx de contrato ===")
    await fresh_db()
    await seed_wans([100, 130])
    hub = HubStub(dynamic=lambda body: 413 if len(body["rows"]) > 3 else 200)
    async with hub.client() as client:
        pushed = await hub_sync.sync_once(client, batch_size=6)
        sizes = [len(r["rows"]) for r in hub.requests if r["entity"] == "wan_metrics"]
        warns = await sql("SELECT * FROM events WHERE priority = 'warning' "
                          "AND category = 'monitor'")
        check(pushed["wan_metrics"] == 6 and sizes == [6, 3, 3] and len(warns) == 1,
              "413: parte el lote a la mitad ese ciclo + evento warning")

    await fresh_db()
    await seed_wans([100])
    await db.insert_quality(100, "1.1.1.1", 12.0, 1.0, 0.0)
    hub = HubStub(script=[422])
    async with hub.client() as client:
        pushed = await hub_sync.sync_once(client, batch_size=500)
        wm = await db.get_sync_watermark("wan_metrics")
        check(pushed["wan_metrics"] == 0 and wm["consecutive_failures"] == 1
              and pushed["internet_quality"] == 1,
              "422: cursor no avanza pero el ciclo sigue con la siguiente entidad")


async def main() -> None:
    print(f"DB temporal: {TMP}")
    saved = (settings.hub_sync_enabled, settings.mock_mode, settings.retention_days)
    try:
        await escenario_1()
        await escenario_2()
        await escenario_3()
        await escenario_4()
        await escenario_5()
        await escenario_6()
        await escenario_7()
        extra_alias_token()
        await extra_politica_errores()
    finally:
        settings.hub_sync_enabled, settings.mock_mode, settings.retention_days = saved
        shutil.rmtree(TMP, ignore_errors=True)
    total = CHECKS["ok"] + CHECKS["fail"]
    print(f"\n=== {CHECKS['ok']}/{total} checks OK ===")
    if CHECKS["fail"]:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
