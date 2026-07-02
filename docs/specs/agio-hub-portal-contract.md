# Contrato — Vista del Monitor de Firewall en el portal del Hub (pages/)

> **Estado: BORRADOR v0.1 — para el equipo Agio-Hub.**
> Decisión de Carlos (2026-07-02): la vista debe vivir en `apps/web/src/pages/` y seguir los lineamientos del portal, como el resto de las aplicaciones del hub — no como app de carpeta propia.
> Este documento es el insumo para que el equipo Hub haga esa integración; el equipo FWD-001 no vuelve a tocar el frontend del hub.

---

## 1. Qué ya existe mergeado (reutilizable tal cual)

| Pieza | PR | Estado |
|---|---|---|
| Ingesta `POST /integrations/firewall-monitor/metrics` + tablas `fw_*` | #204/#205 | En prod-ready; contrato v0.2 en [agio-hub-ingest-contract.md](agio-hub-ingest-contract.md) |
| **API de lectura** `GET /firewall_monitor/*` (summary, wan-metrics, system-metrics, quality, events, vpn-tunnels), gate server-side `firewall_monitor.view` | #208 | **No requiere ningún cambio** — es la fuente de datos de la vista, venga de donde venga el frontend |
| App de carpeta propia `apps/firewall_monitor/` | #209 | **A retirar/reemplazar** por la página (ver §3) |
| Tile ghost `firewall-monitor` (`app_url=/apps/firewall-monitor/`) + `APP_VISUALS`/`APP_DISPLAY_NAMES` + regla Caddy | #210 | Tile y visuales se conservan; **solo cambia `app_url`** a la ruta nueva; la regla Caddy se elimina |

## 2. API de lectura — referencia rápida (sesión de usuario + permiso IAM)

- `GET /firewall_monitor/summary` → `{system{ts,cpu_pct,mem_pct,sessions,uptime_sec}, wans[{ts,wan_name,oper_status,bps_in,bps_out,…}], tunnels_up, tunnels_total, events_24h, last_ingest_ts}`
- `GET /firewall_monitor/wan-metrics|system-metrics|quality` → series asc; params `since`/`until` (epoch s), `wan`/`target`, `limit` ≤5000
- `GET /firewall_monitor/events` → `{total, items[]}` desc; `priority`/`category`/`since`/`limit` ≤500/`offset`
- `GET /firewall_monitor/vpn-tunnels` → túneles vivos, orden por nombre
- Sin sesión → 401 · sin `firewall_monitor.view` → 403 `iam.forbidden` · params fuera de rango → 422
- v1 agrega todas las credenciales (una instalación); multi-sitio expondrá filtro por credencial

## 3. Lo que pedimos al equipo Hub

1. **Página del portal** (`apps/web/src/pages/firewall-monitor.html` + JS, o vista de la plataforma "Tableros" vía su skill `anclar-tablero` — a su criterio, ellos son dueños del lineamiento). Paneles v1 ya diseñados y con lógica portable en `apps/firewall_monitor/app.js` (#209), libre de copiar/adaptar: resumen (WANs up/down + bps, CPU/mem/sesiones, túneles, eventos 24 h, `last_ingest_ts`), tráfico WAN 3 h (sparkline SVG sin lib), eventos paginados con filtro por prioridad, túneles VPN. Helpers listos: `esc()` anti-XSS, `fmtBps`, `fmtTs`, `sparkline()`.
2. **Retiro de la carpeta propia**: eliminar `apps/firewall_monitor/`, su entrada en `workspaces`, el plugin `serve-firewall-monitor` de `apps/web/vite.config.js` y la regla Caddy de `plans/deploy/Caddyfile` (nunca llegó a prod).
3. **Tile**: UPDATE del ghost `firewall-monitor` → `app_url` de la página nueva (patrón del UPDATE defensivo de la migración `b8d2f6a4c9e1`; los visuales y el display name ya existen).
4. **Estados de la vista**: vacío ("Sin datos ingestados todavía" cuando `last_ingest_ts` es null), 403 (mensaje de permiso), error de red (banner con reintento). Nunca pantalla en blanco.
5. **Manual**: 02/04/09 según su tabla de capítulos.

## 4. Preguntas abiertas

1. ¿Página suelta en `pages/` o vista del menú "Tableros" (`anclar-tablero`)? Recomendamos Tableros si quieren que conviva con CRC/SES/W365.
2. ¿`firewall_monitor.view` se queda admin-only o se asigna a `supervisor`? (pendiente desde #208)
3. ¿Retiran `apps/firewall_monitor/` en el mismo PR o lo deprecan primero?

## 5. Datos para probar

Dev Postgres ya tiene datos demo ingestados por el flujo real (108 puntos WAN 3 h, 12 eventos, 3 túneles, calidad). Para regenerar: cualquier `POST` al ingest con el token `firewall-monitor-batch` (contrato de ingesta §8). En prod, los datos llegan al activar `HUB_SYNC_ENABLED=true` en el middleware tras el seed (pendiente de deploy).

---

_v0.1 — 2026-07-02 — FWD-001 · sustituye el frontend de #209/#210 por página del portal; la API de #208 y la ingesta no cambian_
