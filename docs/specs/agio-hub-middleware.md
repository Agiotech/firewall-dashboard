# Spec — Middleware: sincronización de métricas con Agio-Hub

> Generado siguiendo el proceso SDD de `.agents/AGENTS.md` §"Proceso SDD para nuevos features".
> Skills consultadas: [`sdd`](../../.agents/.skills/sdd/SKILL.md) (estructura Fase 1/2),
> [`agio-hub-integration`](../../.agents/.skills/agio-hub-integration/SKILL.md) (patrón de identidad/secrets contra el Hub),
> [`python-architecture`](../../.agents/.skills/python-architecture/SKILL.md) (layout del módulo nuevo).
> Fuera de alcance de este spec (ver §Fuera de alcance): `migrar-dashboard`, `crear-app-web-hub`, `odoo-integration`.

---

## Contexto

Hoy el dashboard es una app **standalone**: recolecta (SNMP/Syslog/NetFlow), persiste en SQLite WAL local, y sirve su propia UI. No transmite nada fuera del host.

`.agents/AGENTS.md` (§Arquitectura objetivo) ya declara la intención de convertirlo en middleware:

```
[Zyxel USG Flex 700H] → SNMP/Syslog/NetFlow → [firewall-dashboard backend]
                                                  - persiste en SQLite WAL (buffer local)
                                                  - transmite a Agio-Hub vía HTTP + Bearer token
                                              → [Agio-Hub API :8000]
```

Este spec cubre **solo la capa de transmisión** (store-and-forward hacia Agio-Hub). La recolección y persistencia local ya existen y no cambian — ver [ARQUITECTURA.md](../ARQUITECTURA.md), [METRICAS.md](../METRICAS.md).

**Restricción heredada** ([CLAUDE.md](../../CLAUDE.md) raíz): esta capa es puramente de salida (dashboard → Hub). No toca la configuración del firewall bajo ninguna circunstancia; esa regla no se ve afectada por este cambio.

---

## FASE 1 — Especificación (BDD)

```gherkin
Feature: Sincronización de métricas del firewall con Agio-Hub
  Como responsable de TI de Agiotech
  Quiero que el dashboard transmita hacia Agio-Hub las métricas que ya recolecta
  Para tener una vista consolidada del estado de la red en el portal corporativo,
  sin depender de que Agio-Hub esté siempre disponible

  Scenario: Sincronización habilitada transmite datos nuevos periódicamente
    Given el middleware tiene la sincronización habilitada y un token de aplicación válido
    And existen métricas nuevas desde la última sincronización exitosa
    When corre un ciclo de sincronización
    Then las métricas nuevas se envían a Agio-Hub en lotes
    And el marcador de "última posición sincronizada" solo avanza si Agio-Hub confirma la recepción

  Scenario: Agio-Hub no está disponible
    Given el middleware intenta sincronizar
    When Agio-Hub no responde o responde con un error de servidor
    Then los datos permanecen íntegros en el almacenamiento local
    And el middleware reintenta más tarde con una espera creciente (backoff), sin bloquear
      el resto de sus funciones (polling SNMP, syslog, UI)

  Scenario: Token de aplicación inválido o revocado
    Given Agio-Hub responde "no autorizado" a un intento de sincronización
    When el middleware detecta esta respuesta
    Then deja de reintentar agresivamente
    And registra un evento local de prioridad error indicando que el token debe renovarse
    And el resto del dashboard sigue funcionando con normalidad

  Scenario: Reinicio del middleware
    Given el proceso se reinicia después de haber sincronizado datos previamente
    When arranca de nuevo
    Then retoma la sincronización desde el último punto confirmado
    And no reenvía datos ya confirmados ni omite datos generados durante el reinicio

  Scenario: Modo de datos sintéticos (MOCK_MODE)
    Given el middleware corre en modo de datos sintéticos
    When se cumple un ciclo de sincronización
    Then no se transmite ningún dato sintético a Agio-Hub

  Scenario: Retención local choca con datos aún no confirmados
    Given existen datos más viejos que el periodo de retención configurado
    And esos datos aún no fueron confirmados por Agio-Hub
    When corre la purga de retención
    Then el middleware registra un evento de advertencia antes de perder esos datos

  Scenario: Sincronización deshabilitada (comportamiento actual)
    Given la sincronización con Agio-Hub está deshabilitada
    When el middleware opera normalmente
    Then no intenta contactar a Agio-Hub en ningún momento
    And el dashboard funciona exactamente igual que hoy (cero regresión)
```

---

## FASE 2 — Plan técnico

### 2a. Arquitectura del módulo nuevo

Sigue las convenciones ya existentes en `backend/app/` (ver responsabilidades en [ARQUITECTURA.md](../ARQUITECTURA.md) §"Responsabilidades por capa"):

```
backend/app/hub/
├── __init__.py
├── client.py     # HubClient (httpx.AsyncClient): bootstrap() + push(entity, rows). Comunicación pura, sin dominio.
│                 # (mirror de snmp/client.py: solo I/O, no conoce las tablas ni el negocio)
├── entities.py   # Catálogo estático de qué se sincroniza: tabla, columna de cursor, mapeo a payload.
│                 # (mirror de snmp/oids.py: constantes, no ejecuta queries)
└── sync.py       # Orquestador: por entidad, lee desde el watermark, arma lote, llama al client,
                  # avanza el watermark solo si hay 200, aplica backoff si falla.
                  # (mirror de snmp/poller.py: coordina, no habla HTTP directamente con dominio)
```

`cache/database.py` (único punto de acceso a SQLite, ver ARQUITECTURA.md) gana:
- La tabla `hub_sync_state` (uno por entidad).
- Dos funciones genéricas: `get_sync_watermark(entity)` / `set_sync_watermark(entity, ts, id, ok, error=None)`.
- Una función genérica de lectura: `read_rows_since(table, ts_column, since_ts, since_id, limit)` — reutilizable por las 6 entidades de fase 1 sin duplicar código por tabla.

`scheduler/jobs.py` gana un job `_job_hub_sync`, condicional a `HUB_SYNC_ENABLED`, con el mismo patrón try/except-log que los jobs existentes (`_job_poll`, `_job_retention`, etc.).

**Decisión de diseño — async, no sync**: la skill `agio-hub-integration` establece "httpx sync, no async" como regla no negociable, pero esa regla nace del caso ODW (apps Qt/CLI). Este backend es 100% asyncio (FastAPI + aiosqlite + pysnmp async); meter httpx síncrono en un job de APScheduler async bloquearía el event loop. Se usa `httpx.AsyncClient` aquí como adaptación explícita al contexto, no como violación silenciosa de la skill.

### 2b. Modelo de datos

```sql
CREATE TABLE IF NOT EXISTS hub_sync_state (
    entity                TEXT PRIMARY KEY,
    last_ts               INTEGER NOT NULL DEFAULT 0,
    last_id               INTEGER NOT NULL DEFAULT 0,
    last_attempt_ts       INTEGER,
    last_success_ts       INTEGER,
    consecutive_failures  INTEGER NOT NULL DEFAULT 0,
    last_error            TEXT
);
```

**Entidades de fase 1** (bajo volumen, alto valor — se amplía en fases futuras siguiendo el mismo patrón que `docs/ROADMAP.md` usa para el resto del proyecto):

| Entidad | Tabla origen | Columna de cursor |
|---|---|---|
| `wan_metrics` | `wan_metrics` | `ts` |
| `system_metrics` | `system_metrics` | `ts` |
| `events` | `events` | `id` (autoincrement, más confiable que `ts` con duplicados) |
| `wan_status_changes` | `wan_status_changes` | `id` |
| `vpn_tunnels` | `vpn_tunnels` | `last_seen` |
| `internet_quality` | `internet_quality` | `ts` |

Deliberadamente **fuera de fase 1**: `flow_aggregates` (alta cardinalidad, requiere agregación previa — ver ROADMAP Fase 8), `devices`/`dhcp_reservations`/`geoip_cache` (catálogos, no series de tiempo — mejor sincronizarlos completos bajo demanda, no en el pipeline incremental), `hardware_metrics`/`device_metrics` (se añaden cuando el Hub tenga vista para ellos).

### 2c. Contrato de API — lado Agio-Hub

> 📄 Contrato detallado (schemas por entidad, idempotencia, volúmenes, preguntas abiertas) en
> [agio-hub-ingest-contract.md](agio-hub-ingest-contract.md) — ese documento es el que se revisa con el equipo Agio-Hub.

> ⚠️ **Este endpoint HOY NO EXISTE.** La skill `agio-hub-integration` es explícita: solo hay 7 endpoints verificados en el Hub (login, refresh, me, bootstrap, credentials, credentials/rotate, secrets), y ninguno es de ingestión de datos. Implementarlo es un **prerequisito de este spec** — un PR aparte en el repo `2026_Agio-Hub`, siguiendo el mismo patrón de auth que `/apps/config/bootstrap` (Bearer `app_token`, no JWT de usuario).

```
POST {HUB_URL}/integrations/firewall-monitor/metrics
Authorization: Bearer <APP_TOKEN_FIREWALL_MONITOR_BATCH>

Request:
{
  "entity": "wan_metrics",        // uno de la tabla §2b
  "rows": [ { ...columnas de la tabla origen... }, ... ]   // ≤ HUB_SYNC_BATCH_SIZE
}

Response 200:
{ "accepted": <int> }

Response 401: app_token inválido, revocado o expirado → no reintentar en loop, esperar renovación manual
Response 413: lote demasiado grande → reducir HUB_SYNC_BATCH_SIZE
Response 5xx / timeout: error transitorio del Hub → backoff exponencial, no avanzar watermark
```

Provisioning lado Hub (adaptado de `agio-hub-integration` §Paso 1, usando el slug `firewall_monitor` ya declarado en `.agents/AGENTS.md`):

1. Agregar a `2026_Agio-Hub/api/domains/iam/catalog.py`: permiso `firewall_monitor.ingest` ("Recibir métricas del middleware de firewall"), asignado al rol `admin` y a un rol de servicio si el Hub distingue apps de usuarios.
2. Implementar el router `integrations/firewall_monitor.py` en el Hub: valida `Bearer <app_token>` igual que `/apps/config/bootstrap`, valida el `entity` contra una lista blanca, inserta/reenvía las filas.
3. Copiar `scripts/seed_odw_credentials.py` → `scripts/seed_firewall_monitor_credentials.py`: `audience=["firewall_monitor"]`, `credentials_to_seed=["firewall_monitor-batch"]`, sin `secrets_to_seed` propios (este middleware no necesita secrets del Hub, solo necesita emitir datos) salvo que a futuro el Hub le entregue `HUB_URL` vía bootstrap.
4. Correr el seed → escribe `HUB_URL` + `APP_TOKEN_FIREWALL_MONITOR_BATCH` al `.env` de este repo (gitignored). Nunca se imprime el token a stdout.

### 2d. Variables de entorno nuevas

Siguiendo la regla de [CLAUDE.md](../../CLAUDE.md) §2: toda variable nueva va en `.env.example` + `app/config.py` + `docs/CONFIG.md`.

| Variable | Tipo | Default | Sensible | Descripción |
|---|---|---|---|---|
| `HUB_SYNC_ENABLED` | bool | `false` | no | Activa la transmisión a Agio-Hub. En `false`, comportamiento actual sin cambios |
| `HUB_URL` | str | — | no | Base URL de Agio-Hub (ej. `http://localhost:8000`) |
| `HUB_APP_TOKEN` | str | — | **sí** | Token de aplicación (`audience=firewall_monitor`, surface `batch`), emitido por el seed script del Hub |
| `HUB_SYNC_INTERVAL_S` | int | `60` | no | Frecuencia del job de sincronización |
| `HUB_SYNC_BATCH_SIZE` | int | `500` | no | Máximo de filas por request |
| `HUB_SYNC_TIMEOUT_S` | int | `10` | no | Timeout HTTP por request al Hub |
| `HUB_SYNC_MAX_BACKOFF_S` | int | `900` | no | Tope del backoff exponencial tras fallos consecutivos |

### 2e. Manejo de errores y observabilidad

Sigue el patrón ya establecido en [CLAUDE.md](../../CLAUDE.md) §7 para el poller SNMP: **no reintentar agresivamente — backoff exponencial con tope**, y registrar en `events` con `category='monitor'`.

| Situación | Acción |
|---|---|
| Timeout / 5xx transitorio | Backoff exponencial (`min(2^fallos, HUB_SYNC_MAX_BACKOFF_S)` segundos), watermark no avanza |
| 401 (token inválido/revocado) | Se detiene el intento activo; se registra evento `priority=error`, `category=monitor`, mensaje "Token de Agio-Hub inválido, requiere renovación manual"; el job sigue corriendo en su intervalo normal (no en loop apretado) por si se renueva el token en caliente |
| 413 (lote muy grande) | Se registra evento `priority=warning`; se reduce el lote a la mitad para ese ciclo (no cambia `HUB_SYNC_BATCH_SIZE` en `.env` automáticamente) |
| Purga de retención sobre datos no confirmados | Antes de purgar filas de una entidad sincronizable cuyo `ts`/`id` sea mayor al último watermark confirmado, registrar evento `priority=warning`, `category=monitor`: "Se purgaron N filas de `<entidad>` sin confirmar por Agio-Hub" |

### 2f. Fuera de alcance

| Skill relacionada | Por qué no aplica aún |
|---|---|
| `migrar-dashboard` | Cubre absorber el frontend al monorepo `agio-hub`. Este spec mantiene el frontend donde está — el dashboard sigue siendo standalone, solo gana una salida de datos |
| `crear-app-web-hub` | Cubre crear una vista in-hub para consumir estos datos. Es la contraparte lógica de este spec, pero depende de que el endpoint de ingestión (§2c) ya exista y tenga datos reales fluyendo |
| `odoo-integration` | El Hub es FastAPI nativo (ver `agio-hub-integration` §Arquitectura); no hay capa Odoo de por medio en esta integración |

---

## Plan de implementación (incrementos, 1 a la vez per `sdd`)

1. `hub_sync_state` + `get_sync_watermark`/`set_sync_watermark`/`read_rows_since` genéricos en `cache/database.py`.
2. `app/hub/entities.py` — catálogo de las 6 entidades de fase 1.
3. `app/hub/client.py` — `HubClient` async: `push(entity, rows)`, manejo de 401/413/5xx/timeout.
4. `app/hub/sync.py` — orquestador: itera entidades, lee desde watermark, respeta `HUB_SYNC_BATCH_SIZE`, aplica backoff.
5. `scheduler/jobs.py` — `_job_hub_sync`, registrado solo si `HUB_SYNC_ENABLED=true`.
6. `cache/database.py` `purge_old()` — chequeo de "no purgar sin confirmar" + evento de advertencia (§2e).
7. Registrar `HUB_*` en `.env.example`, `app/config.py`, [`docs/CONFIG.md`](../CONFIG.md).
8. (Repo aparte, `2026_Agio-Hub`) permiso IAM + router de ingestión + seed script — ver §2c.
9. Smoke test manual: bootstrap/token OK, push real de un lote, verificar en Hub, verificar que `HUB_SYNC_ENABLED=false` no cambia nada del comportamiento actual.

---

## Checklist de "done"

- [ ] Los 7 escenarios BDD de §Fase 1 tienen verificación manual o test con fixtures
- [ ] `HUB_SYNC_ENABLED=false` reproduce el comportamiento actual sin cambios (cero regresión)
- [ ] Todas las variables nuevas están en `.env.example`, `config.py` y `CONFIG.md`
- [ ] El endpoint de ingestión existe en Agio-Hub (PR aparte) y su contrato coincide con §2c
- [ ] El seed script rota/crea el `APP_TOKEN` y nunca lo imprime a stdout
- [ ] `purge_old()` no borra datos no sincronizados sin antes emitir un evento de advertencia
- [ ] No se hardcodea `HUB_URL` ni ningún token/secreto en código fuente
- [ ] Nuevo job documentado en [ARQUITECTURA.md](../ARQUITECTURA.md) §"APScheduler — jobs periódicos"
