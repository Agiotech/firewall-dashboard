# Roadmap de implementación

Orden recomendado para construir el dashboard. Cada fase entrega valor por sí sola; no es necesario terminar todas para tener algo útil.

---

## Fase 0 — Bootstrap (medio día)

Objetivo: proyecto vacío que arranca y sirve un "hello dashboard".

- [x] Estructura de carpetas (`app/`, `static/`, `data/`, `docs/`).
- [x] `requirements.txt`, `.env.example`, `CLAUDE.md`.
- [x] `app/config.py` con pydantic-settings.
- [x] `app/db.py` con esquema SQLite mínimo y migraciones.
- [ ] `app/main.py` con FastAPI vacío + lifespan.
- [ ] Endpoint `/` que sirve `static/index.html`.
- [ ] `run.ps1` que activa venv y arranca uvicorn.
- [ ] Verificación: `http://localhost:8088` responde.

**Salida**: app corre, no muestra nada útil aún, pero la plomería existe.

---

## Fase 1 — Modo mock con UI básica (1 día)

Objetivo: ver el dashboard funcionando sin tocar el firewall.

- [ ] `snmp_poller.py` con `MOCK_MODE=true`: genera bps/CPU/sesiones sintéticos cada 30s, escribe en SQLite.
- [ ] Mock simula caída de WAN cada 5min durante 30s para validar alertas.
- [ ] `routes.py` con `/api/health`, `/api/wan`, `/api/wan/{name}/metrics`, `/api/system`.
- [ ] `static/index.html` + `app.js` con:
  - Tarjetas de Global Health
  - Gráfica de tráfico WAN
  - Gráfica de CPU/MEM/sessions
- [ ] Refresco automático cada 30s.
- [ ] Tema claro/oscuro.

**Salida**: dashboard que se ve completo, con datos sintéticos. Validable sin SNMP listo.

---

## Fase 2 — Integración SNMP real (1 día)

Objetivo: conectar al firewall real y reemplazar los datos sintéticos.

> **Pre-requisito**: el usuario habilita SNMPv3 en el firewall siguiendo [CONFIG_FIREWALL.md](CONFIG_FIREWALL.md).

- [ ] Bootstrap: correr `snmpwalk` desde el server y guardar `docs/snmpwalk-zyxel.txt` para resolver OIDs reales del firmware.
- [ ] `snmp_poller.py` real: consulta MIB-II + Zyxel proprietary, calcula bps a partir de octets cumulativos.
- [ ] Manejo de errores: timeout, auth fallida, OID inexistente.
- [ ] Detección de cambios up/down con persistencia en `wan_status_changes`.
- [ ] Health check del propio poller: si SNMP falla 3 veces, registrar evento.

**Salida**: dashboard con datos reales del firewall. Las tres WAN reales aparecen, sus tráficos reales, su estado real.

---

## Fase 3 — Syslog en vivo (medio día)

Objetivo: capturar eventos en tiempo real.

> **Pre-requisito**: el usuario configura Syslog remoto en el firewall apuntando al servidor.

- [ ] `syslog_listener.py`: UDP server en 514, async.
- [ ] `parsers.py`: parser robusto del formato Zyxel.
- [ ] Endpoint `/api/events` con filtros y paginación.
- [ ] Panel "Recent events" en la UI con auto-refresh.
- [ ] Conteos por minuto: drops, attacks, etc.
- [ ] Detección automática de eventos `Connectivity Check ... DEAD/ALIVE` → escribir a `wan_status_changes` aunque SNMP no lo haya visto aún.

**Salida**: feed de eventos vivo, complementa al polling SNMP.

---

## Fase 4 — Calidad de internet (probes activos) (medio día)

Objetivo: medir latencia/loss que ven los usuarios.

- [ ] `quality_worker.py`: hace `ping` a destinos en `.env`, mide latencia/loss/jitter.
- [ ] Tabla `internet_quality`.
- [ ] Panel de latencia en el dashboard.

**Salida**: ya no dependes solo de "está la WAN up" — sabes si el internet **funciona bien**, no solo si el cable está conectado.

---

## Fase 5 — Alertas (1 día)

Objetivo: que el dashboard te avise antes de que te llamen.

- [ ] `alerts.py`: motor de reglas con state, hysteresis, dedupe.
- [ ] Reglas implementadas (ver [ALERTAS.md](ALERTAS.md)).
- [ ] Canal email (SMTP).
- [ ] Canal webhook (Slack/Teams).
- [ ] Panel "Active alerts" en UI.
- [ ] Snooze desde UI.
- [ ] Ventanas de mantenimiento.

**Salida**: notificaciones llegan a correo/Slack cuando algo se rompe.

---

## Fase 6 — Rollups y retención larga (medio día)

Objetivo: que la DB no crezca para siempre y que los rangos largos sean rápidos.

- [ ] `rollup_worker.py`: cada minuto, agrega a buckets 5m y 1h.
- [ ] `retention_worker.py`: diario, purga datos viejos según `.env`.
- [ ] API selecciona automáticamente la resolución según el rango pedido.

**Salida**: gráficas de "últimos 30 días" cargan rápido. Disco bajo control.

---

## Fase 7 — LAN ports y SFP (medio día)

Objetivo: extender el dashboard a puertos LAN y fibra.

- [ ] SNMP de `ifTable` para puertos LAN del USG.
- [ ] SNMP DDM si el firmware lo expone (puede no aplicar).
- [ ] Panel "LAN Ports" en UI.
- [ ] Drill-down por puerto.

**Salida**: ves cuando un cable se desconecta, cuando un puerto negocia a 100M, cuando un SFP empieza a degradar.

---

## Fase 8 — NetFlow / Top talkers (1–2 días, condicional)

Objetivo: identificar **qué host** consume cuándo, **qué destinos** dominan el tráfico.

> **Pre-requisito**: validar que el USG Flex 700H exporta NetFlow v9 en el firmware actual. Si no, esta fase queda en backlog hasta upgrade de firmware o cambio de equipo.

- [ ] `netflow_listener.py`: server UDP 2055, decode templates v9.
- [ ] Agregación por src/dst/port en ventanas de 1 min.
- [ ] Top talkers persistidos.
- [ ] Panel "Top Talkers" en UI.
- [ ] Resolución reversa de hostname (cache 24h).

**Salida**: cuando una WAN se satura, en 1 click sabes quién la está saturando.

---

## Fase 9 — VPN tunnels (medio día)

Objetivo: vigilar los túneles a sucursales.

- [ ] SNMP de la tabla de túneles IPSec del Zyxel.
- [ ] Estado, bytes, último DPD ok.
- [ ] Detección de tunnels que estaban UP y caen → alerta `VPN_DOWN`.
- [ ] Panel "VPN Tunnels".

**Salida**: si Perisur, Buenavista, Constituyentes, etc. se desconectan, lo sabes antes que la sucursal llame.

---

## Fase 10 — Hardening y despliegue (medio día)

Objetivo: pasarlo de "corre en mi laptop" a "corre en un servidor estable".

- [ ] Servicio Windows (con `nssm`) o tarea programada para autostart.
- [ ] Reverse proxy con TLS si se expone fuera de la VLAN.
- [ ] Auth básica para la UI (`API_AUTH_USER/PASS` en `.env`).
- [ ] Backup automático de `data/dashboard.db`.
- [ ] Healthcheck endpoint `/api/_health` para monitorear el monitor.
- [ ] Documentar runbook de incidentes comunes.

**Salida**: el dashboard se vuelve infraestructura confiable, no un script personal.

---

## Estimación total

| Fase | Esfuerzo | Acumulado |
|---|---|---|
| 0 | 0.5 d | 0.5 d |
| 1 | 1 d | 1.5 d |
| 2 | 1 d | 2.5 d |
| 3 | 0.5 d | 3 d |
| 4 | 0.5 d | 3.5 d |
| 5 | 1 d | 4.5 d |
| 6 | 0.5 d | 5 d |
| 7 | 0.5 d | 5.5 d |
| 8 | 1–2 d | 6.5–7.5 d |
| 9 | 0.5 d | 7–8 d |
| 10 | 0.5 d | 7.5–8.5 d |

**MVP usable** = Fases 0–3 (≈3 días).
**MVP con alertas** = Fases 0–5 (≈4.5 días).
**Versión completa** = todas (≈8 días de trabajo enfocado).

---

## Criterios para considerar cada fase "done"

- Código revisado contra [CLAUDE.md](../CLAUDE.md) (read-only confirmado).
- Variables nuevas registradas en `.env.example`, `config.py` y [`CONFIG.md`](CONFIG.md).
- Endpoint nuevo documentado en [`DASHBOARD.md`](DASHBOARD.md).
- Manual smoke test desde el navegador.
- (Opcional) Test mínimo en `tests/` con datos fixture.
