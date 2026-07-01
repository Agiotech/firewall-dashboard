# Dashboard — UI

Diseño visual y de interacción. Implementación: **React + Vite + TypeScript + Tailwind v4 + ECharts**, siguiendo el design system Agiotech (ver [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)).

> El catálogo extendido de gráficas vive en [GRAFICAS_ADICIONALES.md](GRAFICAS_ADICIONALES.md).

---

## 1. Página principal (`/`)

Vista unificada, secciones separadas por `space-y-10`, contenedor `max-w-[1600px] mx-auto px-8`.

```
+---------------------------------------------------------------------------------------+
| LOGO  [Rango: 1h • 6h • 24h • 7d • 30d]    Última act. 14:13:21   [↻]  [☾/☀]          |
+---------------------------------------------------------------------------------------+
|                                                                                       |
|  ALERTAS ACTIVAS (solo si hay)                                                        |
|  +------------------------------------------------------------------------------+     |
|  | [HIGH] WAN3 down for 12 min   |   [MED] WAN1 latency >80ms last 5 min        |     |
|  +------------------------------------------------------------------------------+     |
|                                                                                       |
|  ━━ GLOBAL HEALTH                                                                     |
|  +--------------+ +--------------+ +--------------+ +--------------+ +--------------+ |
|  | WAN1   ● UP  | | WAN2   ● UP  | | WAN3  ● DOWN | | CPU      12% | | MEM      41% | |
|  | Telmex Pri.  | | Telmex Sec.  | | Backup       | | Sess     4321| | Uptime 14d   | |
|  | 82 / 12 Mbps | | 340 / 22 Mbps| | --           | | sparkline    | | sparkline    | |
|  | Lat 18ms 0%  | | Lat 22ms 0%  | | sparkline    | |              | |              | |
|  +--------------+ +--------------+ +--------------+ +--------------+ +--------------+ |
|                                                                                       |
|  ━━ TRÁFICO WAN                                                                       |
|  +---------------------------------------------+ +-----------------------------+      |
|  |  WANTrafficChart (3 líneas in + 3 dashed out)| | LatencyPercentilesChart    |      |
|  |  zoomable, marca downtimes en rojo claro     | | p50 línea + p90/p99 banda  |      |
|  +---------------------------------------------+ +-----------------------------+      |
|                                                                                       |
|  ━━ FAILOVERS Y DISPONIBILIDAD                                                        |
|  +-----------------------------------------+ +--------------------------------+      |
|  | WANGanttTimeline (últimos 7 días)       | | CalendarHeatmap (90d disp.)    |      |
|  | barras por estado UP/DOWN x WAN         | | grid mes a mes por WAN         |      |
|  +-----------------------------------------+ +--------------------------------+      |
|                                                                                       |
|  ━━ SESIONES                                                                          |
|  +---------------------------------------------+ +-----------------------------+      |
|  |  Sesiones totales (línea con bandas tcp/udp) | | Top 10 hosts por sesiones  |      |
|  |                                              | | barras horizontales         |      |
|  +---------------------------------------------+ +-----------------------------+      |
|                                                                                       |
|  ━━ TOP TALKERS (NetFlow, último 5 min)                                               |
|  +-----------------------+ +-----------------------+ +---------------------------+    |
|  | TopTalkers src (LAN)  | | TopTalkers dst (Inet) | | TrafficTreemap apps/ports |    |
|  +-----------------------+ +-----------------------+ +---------------------------+    |
|                                                                                       |
|  ━━ COMPOSICIÓN Y FLUJOS                                                              |
|  +-----------------------------------------+ +--------------------------------+      |
|  | StackedAreaCategory (HTTPS/DNS/VoIP/...)| | VlanWanSankey                  |      |
|  +-----------------------------------------+ +--------------------------------+      |
|                                                                                       |
|  ━━ PATRONES                                                                          |
|  +-----------------------------------------+ +--------------------------------+      |
|  | HourDayHeatmap (saturación por hora×día)| | GeoMap (top external IPs)      |      |
|  +-----------------------------------------+ +--------------------------------+      |
|                                                                                       |
|  ━━ PUERTOS LAN / SFP                                                                 |
|  +-----------------------------------------------------------------------------+     |
|  | LANPortsGrid (tarjetas pequeñas: port1 1G UP / port2 100M UP / sfp1 1G UP ...)|    |
|  +-----------------------------------------------------------------------------+     |
|                                                                                       |
|  ━━ VPN TUNNELS                                                                       |
|  +-----------------------------------------------------------------------------+     |
|  | VPNTunnelsGrid (grid de cards: nombre, estado, uptime, ↓/↑ bps, DPD)         |     |
|  +-----------------------------------------------------------------------------+     |
|                                                                                       |
|  ━━ EVENTOS RECIENTES                                       [filtros ▾]               |
|  +-----------------------------------------------------------------------------+     |
|  | EventsFeed: lista virtual con severidad coloreada, click → DataModal         |     |
|  +-----------------------------------------------------------------------------+     |
|                                                                                       |
+---------------------------------------------------------------------------------------+
```

---

## 2. Componentes y su mapping a paneles

| Panel | Componente principal | Origen |
|---|---|---|
| Header sticky | `layout/Header.tsx` | Agiotech literal |
| Alertas activas | `cards/AlertCard.tsx` | Nuevo (firewall) |
| Tarjetas WAN | `cards/WANStatusCard.tsx` | Wrapper de `ClickableKPICard` + sparkline |
| Tarjetas CPU/MEM/Sess | `cards/SystemHealthCard.tsx` | Wrapper de `ClickableKPICard` + sparkline |
| Tráfico WAN | `charts/WANTrafficChart.tsx` | Multi-line via `BaseChart` |
| Latencia percentiles | `charts/LatencyPercentilesChart.tsx` | Line + bands via `BaseChart` |
| Failovers timeline | `charts/WANGanttTimeline.tsx` | `series.custom` ECharts |
| Disponibilidad 90d | `charts/CalendarHeatmap.tsx` | ECharts calendar |
| Sesiones totales | `charts/SessionsLineChart.tsx` | Line via `BaseChart` |
| Top hosts sesiones | `charts/TopTalkersBarChart.tsx` | Bar horizontal via `BaseChart` |
| Top talkers src/dst | `charts/TopTalkersBarChart.tsx` (mismo, props) | |
| Traffic treemap | `charts/TrafficTreemap.tsx` | ECharts treemap |
| Stacked area cat. | `charts/StackedAreaCategory.tsx` | `BaseChart` stack |
| VLAN→WAN flow | `charts/VlanWanSankey.tsx` | ECharts sankey |
| Heatmap hora×día | `charts/HourDayHeatmap.tsx` | ECharts heatmap |
| Mapa geo | `charts/GeoMap.tsx` | ECharts geo + scatter |
| LAN ports grid | `lists/LANPortsGrid.tsx` | Grid de mini-cards |
| VPN tunnels | `lists/VPNTunnelsGrid.tsx` | Grid de mini-cards |
| Eventos | `lists/EventsFeed.tsx` | Tabla virtual |
| Modal detalle | `common/DataModal.tsx` | Agiotech literal |

---

## 3. Tarjetas KPI (cards/WANStatusCard)

Extiende `ClickableKPICard` agregando:
- Punto de estado (8px) `chartGreen` / `chartAmber` / `chartRed`.
- Sparkline embebida abajo del valor (últimos 60 min).
- Línea secundaria con métricas auxiliares (latencia / loss).

Ejemplo de render (modo light):

```
╔════════════════════════╗
║ WAN1            ● UP   ║
║ Telmex Principal       ║
║                        ║
║ 82 Mbps        [icon]  ║
║ ↑12 Mbps               ║
║ Lat 18ms  Loss 0.0%    ║
║ ───╱╲──╱╲─ sparkline   ║
╚════════════════════════╝
```

Variante DOWN:
- Punto rojo `animate-pulse`.
- Valor "—" tachado en gris.
- Línea secundaria: "Down 12m 4s".
- Sparkline plana en cero, fondo rojo claro.

---

## 4. Rutas (React Router)

| Ruta | Página | Descripción |
|---|---|---|
| `/` | `Dashboard` | Vista principal completa |
| `/wan/:name` | `WANDetail` | Drill-down de una WAN |
| `/host/:ip` | `HostDetail` | Drill-down de un host LAN |
| `/events` | `EventsExplorer` | Browser de eventos con filtros avanzados |
| `/alerts` | `AlertsPage` | Historial de alertas + snooze |
| `/about` | `About` | Versión, links a docs |

---

## 5. Vista detalle por WAN (`/wan/:name`)

```
+-----------------------------------------------------------------+
|  ← Back     WAN: P2-Telmex2                                     |
+-----------------------------------------------------------------+
|  Estado:  ● DOWN since 14:12:15  (1h 23m)                       |
|  Disp. 30d: 98.4 %        Failover (30d): 7 eventos             |
+-----------------------------------------------------------------+
|  Trafico   [in stack out]   [percentiles util%]   [Rango ▾]     |
|  +-----------------------------------------------------------+  |
|  | WANTrafficChart (solo esta WAN, in+out, marca downtimes)  |  |
|  +-----------------------------------------------------------+  |
+-----------------------------------------------------------------+
|  Latencia / loss / jitter                                        |
|  +-----------------------------------------------------------+  |
|  | LatencyPercentilesChart (solo esta WAN)                   |  |
|  +-----------------------------------------------------------+  |
+-----------------------------------------------------------------+
|  Top talkers en esta WAN (último 5 min)                          |
|  +-----------------------+ +-----------------------------------+|
|  | TopTalkersBarChart src| | TopTalkersBarChart dst            ||
|  +-----------------------+ +-----------------------------------+|
+-----------------------------------------------------------------+
|  Línea de tiempo (estados / failovers)                           |
|  +-----------------------------------------------------------+  |
|  | WANGanttTimeline (zoom hasta 30d)                         |  |
|  +-----------------------------------------------------------+  |
+-----------------------------------------------------------------+
|  Eventos relacionados (filtrados por src/dst = interfaz)         |
|  EventsFeed                                                      |
+-----------------------------------------------------------------+
```

---

## 6. Vista detalle por host (`/host/:ip` o modal)

```
+-----------------------------------------------------------------+
|  192.168.3.114      MAC 28:a4:4a:ae:c5:cc                       |
|  Hostname (DNS rev): francisco-mendez-pc                        |
|  Primera vez: 2026-04-12  •  Última: ahora                      |
|  Sesiones actuales: 6321  /  límite 8000  (79%)                 |
+-----------------------------------------------------------------+
|  Sesiones últimas 24h (line con marca de pico)                  |
+-----------------------------------------------------------------+
|  Tráfico in/out últimas 24h                                     |
+-----------------------------------------------------------------+
|  Top 10 destinos del host (tabla)                               |
|  Dst IP            Bytes       Hostname/PTR        País         |
|  8.8.8.8           1.2 GB      dns.google          US           |
|  ...                                                            |
+-----------------------------------------------------------------+
|  Top 10 puertos/apps (donut)                                    |
+-----------------------------------------------------------------+
|  Eventos en los que aparece este host (EventsFeed)              |
+-----------------------------------------------------------------+
|  Indicador si choca con SESSION_LIMIT_PER_HOST                  |
+-----------------------------------------------------------------+
```

---

## 7. Endpoints API que alimentan la UI

| Endpoint | Devuelve |
|---|---|
| `GET /api/health` | Estado global instantáneo (WAN, CPU, MEM, alerts count) |
| `GET /api/wan` | Lista de WAN con últimas métricas + sparkline points |
| `GET /api/wan/{name}/metrics?range=1h` | Serie temporal de tráfico |
| `GET /api/wan/{name}/latency?range=1h` | Serie de p50/p90/p99 |
| `GET /api/wan/{name}/status-history?range=30d` | Cambios up/down (gantt) |
| `GET /api/wan/{name}/availability?range=90d` | Datos para calendar heatmap |
| `GET /api/lan/ports` | Estado de cada puerto LAN/SFP |
| `GET /api/lan/ports/{n}/metrics?range=24h` | Serie por puerto |
| `GET /api/system?range=1h` | CPU/MEM/sessions histórico |
| `GET /api/sessions/top?n=10` | Top hosts por sesiones |
| `GET /api/talkers/src?range=5m&n=20` | NetFlow agregado origen |
| `GET /api/talkers/dst?range=5m&n=20` | NetFlow agregado destino |
| `GET /api/talkers/apps?range=5m&n=20` | NetFlow agregado por puerto/app |
| `GET /api/talkers/geo?range=24h` | Aggregado por país para GeoMap |
| `GET /api/talkers/sankey?range=1h` | Aggregación VLAN → WAN |
| `GET /api/talkers/treemap?range=5m` | Aggregación por app jerárquica |
| `GET /api/vpn` | Estado actual de túneles |
| `GET /api/vpn/{name}/metrics?range=24h` | Tráfico por túnel |
| `GET /api/events?priority=warning&limit=100&offset=0` | Paginado |
| `GET /api/events/heatmap-hour-day` | Para HourDayHeatmap |
| `GET /api/alerts/active` | Alertas no resueltas |
| `POST /api/alerts/{id}/snooze` | Silenciar por N horas |
| `GET /api/sfp` | Estado óptico de SFP |
| `GET /api/quality?range=1h` | Latencia/loss desde el server |
| `GET /api/status` | Last refresh ts, mock_mode flag, version |
| `POST /api/refresh` | Force refresh manual (todos los pollers) |

Formato estándar:

```json
{
  "data": [ ... ],
  "ts_from": 1747917600,
  "ts_to": 1747921200,
  "resolution_s": 30,
  "meta": { "wan": "wan1", "label": "Telmex Principal" }
}
```

Códigos:
- `200` ok.
- `204` no content (sin datos para el rango).
- `503` poller aún no terminó (mostrar skeleton).
- `502` SNMP / firewall inalcanzable (mostrar banner).

---

## 8. Refresh y reactividad

- Polling automático del frontend cada `UI_AUTO_REFRESH_S` (default 30s).
- Cada panel hace su propio fetch — fallos aislados.
- Hook `useFirewallData(endpoint, interval)` encapsula:
  - Llamada inicial
  - Intervalo
  - Cancelación al desmontar
  - Backoff exponencial ante error
  - Estado `{ data, loading, error, lastUpdate }`
- Header muestra `lastUpdate` global = max de los `lastUpdate` por panel.
- Botón refresh global ↻ dispara todos los hooks simultáneamente.

---

## 9. Estados de UI

| Estado | Render |
|---|---|
| Loading inicial | `LoadingSkeleton` por panel — bloques `bg-surface-block` con shimmer |
| Sin datos (204) | `EmptyState` centrado en el panel: "Sin datos en este rango" |
| Error (5xx) | Card amarillo con icono `AlertTriangle` + mensaje + botón "Reintentar" |
| Mock mode activo | Banner en el header: "MODO MOCK — datos sintéticos" (chartAmber) |
| Firewall unreachable | Banner global rojo arriba del header |

---

## 10. Accesibilidad

- Contraste WCAG AA en ambos temas.
- Estados también con icono y texto, no solo color (daltonismo).
- Foco visible en interactivos (`focus-visible:ring-2 ring-primary-container`).
- Atajos:
  - `R` refresh
  - `1`–`5` rangos
  - `/` foco a búsqueda
  - `T` toggle tema
  - `Esc` cerrar modal

---

## 11. Responsive

- **≥1280px** (desktop, target principal): layout grid completo como en el mockup.
- **768–1279px** (tablet): cards a 2 columnas, gráficas full width apiladas.
- **<768px** (móvil): cards a 1 columna; algunas gráficas se ocultan o reemplazan por versión compacta. Modo "monitor de TV vertical" disponible vía `?compact=1`.

---

## 12. Decisiones de diseño

| Decisión | Por qué |
|---|---|
| ECharts en lugar de Chart.js | Más tipos (heatmap, sankey, treemap, geo, calendar) que necesitamos |
| React en lugar de HTML+JS vanilla | Componibilidad, stores, tipado, reuso de patrón Agiotech ya validado |
| Tailwind v4 CSS-first | Standard Agiotech |
| Zustand en lugar de Redux/Context | Más simple, ya es el patrón de Dashboard CE |
| Sin SSR | Dashboard interno, no necesita SEO ni cold start |
| Sin auth en MVP | Acceso restringido por IP del firewall del servidor |
| Polling en lugar de WebSocket | Más simple, 30s es suficiente. WS queda para fase 10 si hace falta |
