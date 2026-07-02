# Contrato de ingestión — firewall-monitor → Agio-Hub

> **Estado: v0.2 — ACEPTADO E IMPLEMENTADO por el equipo Agio-Hub (PR #204 de `agio-hub`, pendiente de merge).**
> Documento contractual entre el middleware `firewall-dashboard` (FWD-001) y el Agio-Hub.
> Contexto general en [agio-hub-middleware.md](agio-hub-middleware.md); este documento detalla §2c de ese spec.
> v0.2 incorpora las correcciones C1–C10 del equipo Hub y sus respuestas a las preguntas §7.
> **Verificado end-to-end en local** contra la rama del PR #204: `backend/scripts/smoke_hub.py` (push 200, re-push idempotente, 401 con token inválido) + `sync_once` real → filas deduplicadas en las tablas `fw_*` con watermarks avanzados.

---

## 1. Propósito

El middleware monitorea un Zyxel USG Flex 700H (SNMP/Syslog/NetFlow), persiste todo en SQLite local (buffer store-and-forward) y transmite lotes incrementales al Hub. El Hub los recibe, los deduplica y los expone en el portal Agiotech.

Principios:

- **El middleware nunca pierde datos por caídas del Hub**: el cursor local solo avanza con confirmación 200.
- **El Hub debe tolerar re-envíos**: un 200 cuya respuesta se perdió en la red provoca que el middleware re-envíe el mismo lote. La ingestión debe ser **idempotente** (upsert por llave natural, ver §5).
- **El origen se deriva del token, no del payload**: el middleware no manda "site id". Cada instalación tendrá su propia `app.credential`; el Hub sabe quién es por el Bearer.

---

## 2. Autenticación y provisioning

Mismo patrón que `POST /apps/config/bootstrap` (skill `agio-hub-integration`):

- Header `Authorization: Bearer <app_token>` — **app token**, no JWT de usuario. JWT de usuario debe rechazarse con `apps.invalid_token`.
- `audience = ["firewall_monitor"]`.
- Credencial inicial: `firewall-monitor-batch` (corrección C4: guiones; una por instalación — futuras instalaciones = credenciales nuevas, mismo audience).

Provisioning en el Hub (implementado en PR #204):

1. **No existe permiso IAM de ingesta** (corrección C1): la ingesta se gatea solo por app token + audiencia — los app tokens no tienen contexto IAM. El único permiso IAM es `firewall_monitor.view` (lectura backoffice `/orm`, rol admin), sembrado code-first al arrancar el Hub.
2. `scripts/seed_firewall_monitor_credentials.py`: crea/rota `firewall-monitor-batch` (audiencia `["firewall_monitor"]`) y escribe `HUB_URL` + `APP_TOKEN_FIREWALL_MONITOR_BATCH` al `.env` del repo del middleware (`FIREWALL_MONITOR_REPO_PATH`). Nunca imprime tokens a stdout. El middleware lee ese nombre de variable tal cual (alias en `config.py`; `HUB_APP_TOKEN` queda como override manual).
   ⚠️ **Bug detectado en la rama del PR #204** (hallado en el e2e local): la ruta "create" del seed llama `AppsService.create_credential()` sin el argumento keyword-only `slug` → `TypeError` en la primera corrida sobre una DB donde la credencial aún no existe (p. ej. el VPS en el deploy). La ruta "rotate" sí funciona. Fix de una línea: `slug=cred_name`. `seed_odw_credentials.py` arrastra el mismo problema latente.
3. Router `api/domains/firewall_monitor/router.py` montado en `/integrations/firewall-monitor` (primer namespace `/integrations/*` del Hub).

---

## 3. Endpoint

```
POST /integrations/firewall-monitor/metrics
Authorization: Bearer <APP_TOKEN_FIREWALL_MONITOR_BATCH>
Content-Type: application/json
```

> **URL en producción** (corrección C3): el Hub vive detrás de `/api` —
> `https://app.agiotech.mx/api/integrations/firewall-monitor/metrics`.
> El `HUB_URL` del middleware en prod DEBE ser `https://app.agiotech.mx/api`.

### Request

```json
{
  "entity": "wan_metrics",
  "rows": [
    { "ts": 1751323800, "wan_name": "wan1", "oper_status": 1,
      "bps_in": 84213.5, "bps_out": 12034.0, "pps_in": 210.0, "pps_out": 95.0 }
  ]
}
```

- `entity`: string, uno de la lista blanca de §4. Cualquier otro valor → `422`.
- `rows`: array de objetos, `1 ≤ len ≤ 500` (el middleware manda máx. `HUB_SYNC_BATCH_SIZE`, default 500). El Hub puede imponer su propio tope y responder `413` si se excede.
- Dentro de un request, `rows` viene ordenado del más viejo al más nuevo. Entre requests, el middleware garantiza orden por entidad (no paraleliza lotes de la misma entidad).
- Timestamps: **epoch UNIX en segundos, UTC, enteros**.

### Responses

| Código | Body | Semántica para el Hub | Reacción del middleware (ya implementada) |
|---|---|---|---|
| `200` | `{"accepted": <int>}` | Lote persistido (o deduplicado) por completo. `accepted` = filas procesadas, informativo | Avanza el cursor; siguiente lote |
| `401` | `{"detail": "apps.invalid_token"}` | Token ausente, inválido, revocado o JWT de usuario (corrección C2) | Detiene el ciclo, evento `error` local, requiere renovación manual del token; no reintenta en loop |
| `403` | `{"detail": "apps.invalid_token"}` | Token válido pero de otra audiencia (corrección C2; mismo `detail`) | Idéntica al 401 (el middleware trata ambos igual) |
| `413` | `{"detail": "firewall_monitor.batch_too_large"}` | Lote excede `FIREWALL_MONITOR_MAX_BATCH_ROWS` (500) | Parte el lote a la mitad ese ciclo |
| `422` | `{"detail": "firewall_monitor.<motivo>"}` (corrección C8) | `entity` fuera de lista blanca o filas con schema inválido | No reintentable: evento `error` local, cursor no avanza |
| `5xx` | — | Error interno / mantenimiento | Backoff exponencial (tope 15 min), cursor no avanza, datos siguen en SQLite |

**Regla crítica**: el Hub **no debe responder 200 parcial**. Si alguna fila del lote no puede persistirse, responder 422/500 con el lote completo rechazado — el middleware reintentará el lote entero. (Simplifica la semántica del cursor; el volumen es bajo.)

---

## 4. Entidades (lista blanca)

Seis entidades en fase 1 → tablas espejo `fw_*` en el Hub (retención 90 días vía `FIREWALL_MONITOR_RETENTION_DAYS`; las series se purgan, `fw_vpn_tunnels` no). El schema de cada fila replica la tabla SQLite del middleware.

Precisiones v0.2 (todas retro-compatibles, sin cambio de payload):

- **C5**: el `id` del payload se guarda como `source_id` en el Hub (mapeo interno).
- **C6**: las métricas numéricas son *nullable* — un null de SNMP no envenena el lote (evita cursor atascado).
- **C7**: *tolerant reader* — el Hub ignora campos extra; el middleware puede evolucionar sin coordinar deploy.
- **C9**: `ts` es INTEGER 32-bit; deuda 2038 documentada lado Hub.
- **C10**: el `last_used_at` de la credencial funge como latido de la instalación (ops detecta middleware caído).

### 4.1 `wan_metrics` — tráfico y estado por WAN (1 fila por WAN cada 30s)

| Campo | Tipo | Nota |
|---|---|---|
| `ts` | int | epoch s |
| `wan_name` | string | `wan1`..`wan3` |
| `oper_status` | int | 1=up, 0=down |
| `bps_in` / `bps_out` | float | bits/s |
| `pps_in` / `pps_out` | float | paquetes/s |

**Llave natural**: `(credencial, ts, wan_name)`.

### 4.2 `system_metrics` — salud del firewall (1 fila cada 30s)

| Campo | Tipo |
|---|---|
| `ts` | int |
| `cpu_pct` / `mem_pct` | float |
| `sessions` | int |
| `uptime_sec` | int |

**Llave natural**: `(credencial, ts)`.

### 4.3 `events` — eventos syslog normalizados

| Campo | Tipo | Nota |
|---|---|---|
| `id` | int | autoincrement local del middleware, monotónico por credencial |
| `ts` | int | |
| `priority` | string \| null | `warning`, `notice`, … |
| `category` | string \| null | `Security Policy Control`, `IPSec VPN`, … |
| `message` | string \| null | |
| `src_ip` / `dst_ip` | string \| null | |
| `src_port` / `dst_port` | int \| null | |
| `action` / `note` | string \| null | |

**Llave natural**: `(credencial, id)`.

### 4.4 `wan_status_changes` — transiciones up/down

| Campo | Tipo |
|---|---|
| `id` | int |
| `ts` | int |
| `wan_name` | string |
| `new_status` | int |

**Llave natural**: `(credencial, id)`.

### 4.5 `vpn_tunnels` — estado de túneles IPSec (upsert, no serie de tiempo)

| Campo | Tipo | Nota |
|---|---|---|
| `name` | string | identificador del túnel |
| `peer_ip` / `local_ip` | string \| null | |
| `state` | string \| null | `UP` / `DOWN` / `NEGOTIATING` |
| `last_event_msg` | string \| null | |
| `last_event_ts` / `last_dpd_ts` | int \| null | |
| `dpd_count` / `rekeys` | int | contadores acumulados |
| `first_seen` / `last_seen` | int | |

**Llave natural**: `(credencial, name)` — **upsert**: la misma fila se re-envía cada vez que el túnel cambia; el Hub reemplaza si `last_seen` entrante ≥ el almacenado (descartar si es menor: re-envío viejo).

### 4.6 `internet_quality` — latencia/pérdida medidas por el middleware

| Campo | Tipo |
|---|---|
| `ts` | int |
| `target` | string (`1.1.1.1`, …) |
| `latency_ms` / `jitter_ms` | float |
| `loss_pct` | float |

**Llave natural**: `(credencial, ts, target)`.

---

## 5. Idempotencia y deduplicación

- El middleware puede re-enviar filas ya persistidas (respuesta 200 perdida, reinicio a mitad de ciclo). El Hub debe hacer **`INSERT ... ON CONFLICT (llave natural) DO UPDATE/NOTHING`** — nunca duplicar, nunca fallar por duplicado.
- Para `vpn_tunnels` el conflicto se resuelve por `last_seen` (§4.5); para el resto, las filas son inmutables — `DO NOTHING` es suficiente.
- `accepted` puede contar filas nuevas o filas totales del lote; el middleware no depende del valor, solo del 200.

## 6. Volumen esperado (dimensionamiento)

| Entidad | Tasa aprox. | Filas/día |
|---|---|---|
| `wan_metrics` | 3 filas / 30s | ~8,600 |
| `system_metrics` | 1 fila / 30s | ~2,900 |
| `internet_quality` | 2 filas / 30s | ~5,800 |
| `events` | variable (filtrado a severidad ≤ notice) | 1k–20k |
| `wan_status_changes` | por transición | decenas |
| `vpn_tunnels` | por cambio de estado | decenas |

Ciclo de sync: cada 60s (`HUB_SYNC_INTERVAL_S`), lotes de ≤500. Régimen normal: ~6 requests/min pico, órdenes de magnitud bajo cualquier límite razonable.

## 7. Preguntas — respondidas por el equipo Hub (v0.2)

1. **Ruta**: confirmada `/integrations/firewall-monitor/metrics` (estrena el namespace `/integrations/*`).
2. **Persistencia lado Hub**: tablas espejo por entidad (`fw_*`).
3. **Retención lado Hub**: 90 días (`FIREWALL_MONITOR_RETENTION_DAYS`; `0` = sin purga). Series de tiempo se purgan; `fw_vpn_tunnels` no.
4. **Tope de lote**: 500 filas (`FIREWALL_MONITOR_MAX_BATCH_ROWS`) → 413 si se excede.
5. **Multi-instalación**: credencial-por-instalación confirmada; sin `installation_id` en el payload. Alta futura: `FIREWALL_MONITOR_CREDENTIAL_NAME=firewall-monitor-batch-<sitio>` + re-correr el seed.

---

## 8. Ejemplo end-to-end (curl)

```bash
curl -X POST "$HUB_URL/integrations/firewall-monitor/metrics" \
  -H "Authorization: Bearer $APP_TOKEN_FIREWALL_MONITOR_BATCH" \
  -H "Content-Type: application/json" \
  -d '{
    "entity": "system_metrics",
    "rows": [
      {"ts": 1751323800, "cpu_pct": 12.5, "mem_pct": 41.0, "sessions": 3210, "uptime_sec": 864000},
      {"ts": 1751323830, "cpu_pct": 13.1, "mem_pct": 41.2, "sessions": 3198, "uptime_sec": 864030}
    ]
  }'
# → 200 {"accepted": 2}
```

---

_v0.2 — 2026-07-01 — FWD-001 · aceptado e implementado por equipo Agio-Hub (PR #204, pendiente de merge) · verificado e2e local contra la rama del PR_
