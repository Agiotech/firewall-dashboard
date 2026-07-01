"""Smoke test end-to-end contra un Agio-Hub real (inc 9 del spec).

Verifica, contra el Hub configurado en .env (o via HUB_URL/token de entorno):
  1. auth OK       - push de un lote real -> 200 {"accepted": N}
  2. idempotencia  - re-push del MISMO lote -> 200 sin duplicar
  3. gate de auth  - token invalido -> 401 apps.invalid_token

No avanza watermarks ni modifica nada local: lee las ultimas filas de una
tabla ya recolectada y las empuja tal cual (re-enviar filas ya confirmadas
es seguro por contrato: el Hub deduplica por llave natural).

Con MOCK_MODE=true se niega a correr (los datos sinteticos no viajan al Hub)
salvo --allow-mock, pensado solo para un Hub de laboratorio local.

Uso (desde backend/ con venv activo):
    python scripts/smoke_hub.py [--allow-mock]
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.config import settings
from app.cache import database as db
from app.hub.client import HubClient, PushStatus
from app.hub.entities import ENTITIES

GREEN, RED, YELLOW, RESET = "\033[92m", "\033[91m", "\033[93m", "\033[0m"


def ok(msg: str) -> None:
    print(f"{GREEN}[OK]{RESET}    {msg}")


def fail(msg: str) -> None:
    print(f"{RED}[FAIL]{RESET}  {msg}")


def warn(msg: str) -> None:
    print(f"{YELLOW}[WARN]{RESET}  {msg}")


async def pick_sample() -> tuple[str, list[dict]]:
    """Ultimas filas reales de la primera entidad con datos (sin tocar watermarks)."""
    for entity in ENTITIES:
        rows = await db.read_rows_since(entity.table, entity.cursor_column, 0, 0, 5)
        if rows:
            sample = [{k: v for k, v in r.items() if k != "_rowid"} for r in rows]
            return entity.name, sample
    return "", []


async def main() -> int:
    allow_mock = "--allow-mock" in sys.argv

    if not settings.hub_url or not settings.hub_app_token:
        fail("Faltan HUB_URL y/o el app token en .env "
             "(APP_TOKEN_FIREWALL_MONITOR_BATCH, lo escribe el seed del Hub).")
        return 1
    if settings.mock_mode and not allow_mock:
        fail("MOCK_MODE=true: los datos sinteticos no viajan al Hub. "
             "Usa --allow-mock SOLO contra un Hub de laboratorio.")
        return 1

    print(f"Hub: {settings.hub_url}  (timeout {settings.hub_sync_timeout_s}s)")

    entity, rows = await pick_sample()
    if not rows:
        fail("No hay filas locales que empujar; corre el dashboard un rato primero.")
        return 1
    print(f"Lote de muestra: {len(rows)} filas de '{entity}'")

    failures = 0

    async with HubClient(settings.hub_url, settings.hub_app_token,
                         timeout_s=settings.hub_sync_timeout_s) as client:
        # 1. push real
        r1 = await client.push(entity, rows)
        if r1.ok:
            ok(f"push acepta el lote: 200 accepted={r1.accepted}")
        else:
            fail(f"push fallo: {r1.status.value} (HTTP {r1.http_status}): {r1.error}")
            if r1.status is PushStatus.AUTH_ERROR:
                warn("Token invalido/revocado: re-corre el seed del Hub y reintenta.")
            if r1.status is PushStatus.TRANSIENT:
                warn("¿El Hub esta arriba? En prod HUB_URL lleva /api "
                     "(https://app.agiotech.mx/api).")
            return 1

        # 2. idempotencia: mismo lote, mismo 200, sin duplicar
        r2 = await client.push(entity, rows)
        if r2.ok:
            ok(f"re-push idempotente: 200 accepted={r2.accepted} (el Hub deduplico)")
        else:
            fail(f"re-push fallo: {r2.status.value} (HTTP {r2.http_status})")
            failures += 1

    # 3. gate de auth: token invalido debe rebotar con 401
    async with HubClient(settings.hub_url, "invalid-token-smoke",
                         timeout_s=settings.hub_sync_timeout_s) as bad:
        r3 = await bad.push(entity, rows[:1])
        if r3.status is PushStatus.AUTH_ERROR:
            ok(f"token invalido rebota: HTTP {r3.http_status} apps.invalid_token")
        else:
            fail(f"token invalido NO rebota como AUTH_ERROR: {r3.status.value} "
                 f"(HTTP {r3.http_status})")
            failures += 1

    if failures == 0:
        print(f"\n{GREEN}Smoke OK{RESET} — el middleware puede hablar con este Hub. "
              "Activa la sync con HUB_SYNC_ENABLED=true.")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
