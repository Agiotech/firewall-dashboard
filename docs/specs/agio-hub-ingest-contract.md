# Contrato de ingestión — firewall-monitor → Agio-Hub

> **Estado: BORRADOR v0.1 — para revisión del equipo Agio-Hub.**
> Documento contractual entre el middleware `firewall-dashboard` (FWD-001) y el Agio-Hub.
> Contexto general en [agio-hub-middleware.md](agio-hub-middleware.md); este documento detalla §2c de ese spec.
> El endpoint descrito **no existe todavía** en el Hub — este contrato es el insumo para implementarlo (PR en `2026_Agio-Hub`).

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
- Credencial inicial: `firewall_monitor-batch` (una por superficie; futuras instalaciones = credenciales nuevas, mismo audience).

Provisioning requerido en el Hub (una vez):

1. `api/domains/iam/catalog.py`: permiso `firewall_monitor.ingest` ("Recibir métricas del middleware de firewall") + `firewall_monitor.view` para el portal. `ROLE_MATRIX[ROLE_ADMIN]` recibe ambos.
2. `scripts/seed_firewall_monitor_credentials.py` (copiar de `seed_odw_credentials.py`): crea/rota `firewall_monitor-batch` y escribe `HUB_URL` + `APP_TOKEN_FIREWALL_MONITOR_BATCH` al `.env` del repo del middleware. Nunca imprime tokens a stdout.
3. Router nuevo `integrations/firewall_monitor.py` implementando §3.

---

## 3. Endpoint

```
POST /integrations/firewall-monitor/metrics
Authorization: Bearer <APP_TOKEN_FIREWALL_MONITOR_BATCH>
Content-Type: application/json
```

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
| `401` / `403` | `{"detail": "apps.invalid_token"}` | Token inválido, revocado o JWT de usuario | Detiene el ciclo, evento `error` local, requiere renovación manual del token; no reintenta en loop |
| `413` | — | Lote excede el tope del Hub | Parte el lote a la mitad ese ciclo |
| `422` | `{"detail": "<motivo>"}` | `entity` fuera de lista blanca o filas con schema inválido | No reintentable: evento `error` local, cursor no avanza |
| `5xx` | — | Error interno / mantenimiento | Backoff exponencial (tope 15 min), cursor no avanza, datos siguen en SQLite |

**Regla crítica**: el Hub **no debe responder 200 parcial**. Si alguna fila del lote no puede persistirse, responder 422/500 con el lote completo rechazado — el middleware reintentará el lote entero. (Simplifica la semántica del cursor; el volumen es bajo.)

---

## 4. Entidades (lista blanca)

Seis entidades en fase 1. El schema de cada fila replica la tabla SQLite del middleware.

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

## 7. Preguntas abiertas para el equipo Agio-Hub

1. **Ruta**: ¿`/integrations/firewall-monitor/metrics` encaja con el routing actual del Hub, o prefieren otro prefijo (p.ej. `/ingest/...`)?
2. **Persistencia lado Hub**: ¿tablas espejo por entidad o un event store genérico? (El contrato no lo restringe; solo pide idempotencia.)
3. **Retención lado Hub**: el middleware retiene 30 días raw localmente; ¿el Hub define su propia política o quiere negociar rangos?
4. **Rate limit / tope de lote**: ¿413 con qué tope? El middleware ya sabe partir lotes.
5. **Multi-instalación futura**: ¿confirman que credencial-por-instalación es el mecanismo de identidad de origen, o prefieren un campo explícito `installation_id` en el payload?

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

_v0.1 borrador — 2026-07-01 — FWD-001 · pendiente de revisión por equipo Agio-Hub_
