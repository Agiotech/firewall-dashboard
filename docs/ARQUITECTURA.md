# Arquitectura

Monorepo de dos apps siguiendo el patrón **Agiotech Dashboard CE**:

- **`backend/`** — FastAPI + SQLite WAL + APScheduler. Polling SNMP, listener Syslog, listener NetFlow (fase 2), API REST.
- **`frontend/`** — React + Vite + TypeScript + Tailwind v4 CSS-first + ECharts + Zustand.

Vite compila a `backend/static/` y FastAPI sirve los assets. Un solo proceso, un solo puerto.

---

## Diagrama lógico

```
                          +--------------------------------------------------+
                          |              USG Flex 700H (read-only)           |
                          |  SNMP agent (UDP/161)                            |
                          |  Syslog client (UDP/514)                         |
                          |  NetFlow exporter (UDP/2055)                     |
                          +--------------------------------------------------+
                                |              |                |
                  SNMP GET poll |  syslog push |  netflow push  |
                  (every 30s)   |              |                |
                                v              v                v
                          +-------------------------------------------------+
                          |                    backend/                     |
                          |                                                 |
                          |  snmp_poller  syslog_listener  netflow_listener |
                          |       \           |                /            |
                          |        \          v               /             |
                          |         +-> [services / rollups / alerts] <-+   |
                          |                       |                         |
                          |                       v                         |
                          |               +---------------+                 |
                          |               | SQLite (WAL)  |                 |
                          |               +-------+-------+                 |
                          |                       |                         |
                          |                       v                         |
                          |               +---------------+                 |
                          |               | FastAPI /api  |                 |
                          |               +---+-------+---+                 |
                          |                   |       |                     |
                          |    HTTP JSON      |       |   static            |
                          |                   v       v                     |
                          |              +-----------------+                |
                          |              |  backend/static |                |
                          |              | (vite build)    |                |
                          |              +-------+---------+                |
                          +-------------------------------------------------+
                                                  |
                                                  v
                                       Browser del usuario (TI/admin)
                                            React + ECharts
```

---

## Estructura de carpetas (obligatoria)

```
dashboard/
├── CLAUDE.md
├── README.md
├── docs/
│
├── backend/
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── __init__.py
│       ├── main.py                # FastAPI entry + lifespan + scheduler
│       ├── config.py              # Settings (pydantic-settings)
│       ├── api/
│       │   ├── __init__.py
│       │   ├── router.py          # Registro central de routers
│       │   ├── schemas.py         # Pydantic models de respuesta
│       │   └── endpoints/
│       │       ├── __init__.py
│       │       ├── health.py      # GET /api/health
│       │       ├── wan.py         # GET /api/wan, /api/wan/{name}/metrics
│       │       ├── lan.py         # GET /api/lan/ports
│       │       ├── system.py      # GET /api/system
│       │       ├── sessions.py    # GET /api/sessions/top
│       │       ├── talkers.py     # GET /api/talkers/{src|dst|apps}
│       │       ├── vpn.py         # GET /api/vpn
│       │       ├── events.py      # GET /api/events
│       │       ├── alerts.py      # GET /api/alerts/active, POST /api/alerts/{id}/snooze
│       │       ├── quality.py     # GET /api/quality
│       │       ├── sfp.py         # GET /api/sfp
│       │       └── status.py      # GET /api/status, POST /api/refresh
│       │
│       ├── snmp/
│       │   ├── __init__.py
│       │   ├── client.py          # pysnmp wrapper async (solo GET/GETBULK)
│       │   ├── oids.py            # constantes: MIB-II + Zyxel proprietary
│       │   ├── poller.py          # job principal cada 30s
│       │   ├── poller_sfp.py      # job cada 5 min para DDM
│       │   └── poller_vpn.py      # job cada 60s para túneles
│       │
│       ├── syslog/
│       │   ├── __init__.py
│       │   ├── listener.py        # asyncio DatagramProtocol UDP/514
│       │   └── parsers.py         # parser formato Zyxel
│       │
│       ├── netflow/                # FASE 2 (condicional)
│       │   ├── __init__.py
│       │   ├── listener.py
│       │   └── templates.py
│       │
│       ├── quality/
│       │   ├── __init__.py
│       │   └── prober.py          # ping activo a destinos externos
│       │
│       ├── cache/
│       │   ├── __init__.py
│       │   └── database.py        # aiosqlite WAL + schema + helpers
│       │
│       ├── scheduler/
│       │   ├── __init__.py
│       │   └── jobs.py            # APScheduler: rollups, retention, alerts
│       │
│       ├── services/
│       │   ├── __init__.py
│       │   ├── wan.py             # cálculos derivados (uptime, sla, etc.)
│       │   ├── topology.py        # mapping VLAN <-> WAN
│       │   ├── geoip.py           # cache IP -> country
│       │   ├── rollups.py         # agregación 30s -> 5min -> 1h
│       │   └── retention.py       # purga por edad
│       │
│       ├── alerts/
│       │   ├── __init__.py
│       │   ├── rules.py           # definición declarativa de reglas
│       │   ├── evaluator.py       # state machine + hysteresis
│       │   └── channels/
│       │       ├── __init__.py
│       │       ├── email.py
│       │       ├── webhook.py
│       │       └── telegram.py
│       │
│       ├── mock/
│       │   ├── __init__.py
│       │   └── generator.py       # datos sintéticos cuando MOCK_MODE=true
│       │
│       └── static/                # vite build output (gitignored)
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css              # @theme Tailwind v4 (ver DESIGN_SYSTEM.md)
        ├── img/
        │   ├── logo_Blanco.png    # aportado por usuario
        │   └── logotipo_negro.png
        │
        ├── api/
        │   └── client.ts          # fetch HTTP tipado
        │
        ├── types/
        │   └── index.ts
        │
        ├── stores/
        │   ├── themeStore.ts      # light/dark con persistencia
        │   ├── rangeStore.ts      # rango 1h | 6h | 24h | 7d | 30d
        │   └── filterStore.ts     # filtros activos (WAN, severidad)
        │
        ├── theme/
        │   ├── colors.ts          # tokens (ver DESIGN_SYSTEM §1.1)
        │   └── echarts-agiotech.ts # tema ECharts light + dark
        │
        ├── hooks/
        │   ├── useFirewallData.ts # polling automático cada 30s
        │   └── useAutoRefresh.ts
        │
        ├── utils/
        │   ├── format.ts          # bps, percentages, durations
        │   └── constants.ts
        │
        ├── components/
        │   ├── layout/
        │   │   ├── Header.tsx
        │   │   └── SectionTitle.tsx
        │   │
        │   ├── cards/
        │   │   ├── ClickableKPICard.tsx    # template literal Agiotech
        │   │   ├── WANStatusCard.tsx       # KPI + sparkline + estado
        │   │   ├── SystemHealthCard.tsx    # CPU/MEM/Sessions
        │   │   └── AlertCard.tsx
        │   │
        │   ├── charts/
        │   │   ├── BaseChart.tsx           # template literal Agiotech
        │   │   ├── WANTrafficChart.tsx
        │   │   ├── LatencyPercentilesChart.tsx
        │   │   ├── TopTalkersBarChart.tsx
        │   │   ├── CalendarHeatmap.tsx
        │   │   ├── HourDayHeatmap.tsx
        │   │   ├── WANGanttTimeline.tsx
        │   │   ├── TrafficTreemap.tsx
        │   │   ├── VlanWanSankey.tsx
        │   │   ├── GeoMap.tsx
        │   │   ├── PortStateDonut.tsx
        │   │   └── StackedAreaCategory.tsx
        │   │
        │   ├── lists/
        │   │   ├── EventsFeed.tsx
        │   │   ├── VPNTunnelsGrid.tsx
        │   │   └── LANPortsGrid.tsx
        │   │
        │   └── common/
        │       ├── DataModal.tsx           # template literal Agiotech
        │       ├── RefreshIndicator.tsx
        │       ├── ThemeToggle.tsx
        │       ├── LoadingSkeleton.tsx
        │       └── EmptyState.tsx
        │
        └── pages/
            ├── Dashboard.tsx       # vista principal
            ├── WANDetail.tsx       # /wan/:name
            ├── HostDetail.tsx      # /host/:ip
            └── EventsExplorer.tsx  # /events (con filtros avanzados)
```

---

## Responsabilidades por capa

### Backend

| Capa | Responsabilidad | NO hace |
|---|---|---|
| `snmp/client.py` | Comunicación pysnmp pura (GET/GETBULK únicamente) | No conoce el dominio firewall |
| `snmp/oids.py` | Catálogo de OIDs como constantes | No hace queries |
| `snmp/poller*.py` | Coordina polls, calcula deltas, escribe en cache | No habla HTTP |
| `syslog/listener.py` | Recibe UDP, despacha al parser | No persiste — delega a services |
| `syslog/parsers.py` | Parser → dict normalizado | No habla con DB |
| `services/*.py` | Lógica de negocio: cálculos derivados, rollups, retención | No habla HTTP |
| `api/endpoints/*.py` | Lee cache, valida con schemas, devuelve JSON | No conoce SNMP |
| `scheduler/jobs.py` | Coordina jobs periódicos (rollups, retention, alerts) | No calcula métricas |
| `cache/database.py` | Abstracción SQLite | No conoce SNMP ni dominio |
| `alerts/evaluator.py` | State machine de reglas | No formatea mensajes |
| `alerts/channels/*.py` | Envío al canal específico | No evalúa reglas |
| `mock/generator.py` | Datos sintéticos plausibles | No persiste |

### Frontend

| Capa | Responsabilidad | NO hace |
|---|---|---|
| `api/client.ts` | Fetch HTTP tipado | No transforma datos |
| `stores/*` | Estado global (tema, rango, filtros) | No hace fetch |
| `theme/*` | Tokens visuales y tema ECharts | No tiene lógica |
| `hooks/*` | Polling automático, autorefresh | No tiene UI |
| `components/cards/*` | Renderizado de una card | No hace fetch |
| `components/charts/*` | Renderizado de una gráfica ECharts via BaseChart | No hace fetch |
| `components/common/*` | Piezas reutilizables (modal, theme toggle, skeletons) | No conoce dominio |
| `pages/*.tsx` | Layout y composición de secciones | No tiene lógica de gráficas |

---

## Flujo de datos

### Polling SNMP (cada 30s)

```
APScheduler ──> snmp_poller.run()
                       │
                       ├─> snmp.client.get_many(OIDS, ifIndices)
                       │
                       ├─> calcular deltas (bps, pps a partir de octets cumulativos)
                       ├─> detectar cambios up/down
                       │
                       └─> services.wan.persist_metrics() ──> SQLite
                                                                │
                                                                v
                                                       (siguiente request al API
                                                        ya las ve)
```

### Syslog en vivo

```
firewall ──UDP/514──> syslog.listener (asyncio DatagramProtocol)
                              │
                              └─> syslog.parsers.parse_zyxel(line)
                                              │
                                              ├─> services.events.persist()
                                              │
                                              └─> if alert/critical:
                                                     alerts.evaluator.trigger()
```

### Request del frontend

```
React Component ──> useFirewallData() ──> api/client.ts ──> GET /api/wan?range=1h
                                                                     │
                                                       FastAPI endpoint
                                                                     │
                                                       services.wan.read_series(...)
                                                                     │
                                                              SQLite (WAL)
                                                                     │
                                                       elige resolución (raw/5m/1h)
                                                       según rango pedido
                                                                     │
                                                                  JSON
                                                                     │
                                                       ECharts re-renderiza
```

---

## APScheduler — jobs periódicos

| Job | Periodicidad | Acción |
|---|---|---|
| `poll_snmp_main` | `POLL_INTERVAL_SECONDS` (30s) | Interfaces + sistema |
| `poll_snmp_sfp` | 300s | DDM óptico |
| `poll_snmp_vpn` | 60s | Túneles IPSec |
| `quality_probe` | 30s | Ping a targets externos |
| `rollup_5m` | 60s | Agrega buckets de 5 min completos |
| `rollup_1h` | 300s | Agrega buckets de 1 h completos |
| `retention_purge` | 1 día (03:00 local) | Borra datos > retención |
| `alert_evaluate` | `ALERT_EVAL_INTERVAL_S` (60s) | Evalúa reglas |
| `geoip_refresh` | 7 días | Refresca DB GeoLite si aplica |
| `hub_sync` | `HUB_SYNC_INTERVAL_S` (60s), solo si `HUB_SYNC_ENABLED` | Empuja lotes pendientes a Agio-Hub desde el watermark; inactivo en `MOCK_MODE` |

---

## Persistencia

- SQLite con WAL en `backend/data/dashboard.db` (configurable `DB_PATH`).
- Tablas raw + rollups 5m + rollups 1h (ver [METRICAS.md](METRICAS.md) §Rollups).
- Backups automáticos a `backend/data/backups/` rotando 7 días (job diario).

---

## Build y despliegue

### Desarrollo

```powershell
# Terminal 1 — backend
cd dashboard/backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8088 --reload

# Terminal 2 — frontend con HMR
cd dashboard/frontend
npm install
npm run dev   # http://localhost:5173 con proxy al backend
```

### Producción (un solo proceso)

```powershell
cd dashboard/frontend
npm run build               # -> backend/static/

cd ../backend
uvicorn app.main:app --host 0.0.0.0 --port 8088
```

FastAPI sirve `backend/static/` como SPA fallback en la ruta `/`. Todo en el mismo puerto (`API_PORT`).

---

## Por qué un solo proceso

- Operacionalmente simple: un `.env`, un puerto, un log.
- SQLite WAL maneja múltiples lectores async + 1 escritor sin friction.
- El volumen de datos es modesto (1 firewall, ~80 métricas, 30s polling).

## Cuándo separar

- Si se monitorea más de un firewall.
- Si NetFlow excede ~5k flows/seg sostenidos.
- Si se necesita HA del dashboard.

---

## Modo Mock

`MOCK_MODE=true` → `mock/generator.py` reemplaza a los pollers reales. Genera:

- bps por WAN con curva senoidal + ruido + caídas simuladas cada N minutos.
- CPU/MEM con ruido alrededor de baseline.
- Sesiones con pico cada 5 min.
- Eventos syslog falsos a tasa configurable.

Útil para:
- Validar UI antes de habilitar SNMP en el firewall.
- Desarrollo offline / demo.
- Tests E2E.

---

## Seguridad

- UI escucha en `API_HOST:API_PORT` (default `0.0.0.0:8088`). En producción, restringir vía firewall del SO a la VLAN admin o usar reverse proxy con auth básica.
- SNMPv3 con SHA + AES. v2c queda solo para `MOCK_MODE` o lab.
- Syslog/NetFlow listeners ignoran paquetes de IPs no listadas en `SYSLOG_ALLOWED_SOURCES` / `NETFLOW_ALLOWED_SOURCES`.
- Credenciales siempre por `.env` (ver [CONFIG.md](CONFIG.md)). Nunca hardcoded.
- Endpoints `/api/refresh` y `/api/alerts/*/snooze` requieren autenticación (futuro) o estar en VLAN admin.
