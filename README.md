# Firewall Dashboard — USG Flex 700H

Sistema de monitoreo y dashboard para el firewall **Zyxel USG Flex 700H** en modo **solo-lectura**, con el design system **Agiotech**.

Recolecta métricas vía SNMP, eventos vía Syslog, y flujos vía NetFlow (fase 2). Almacena en SQLite WAL y los expone en una UI **React + Vite + ECharts**.

> **Restricción operativa:** este proyecto NO modifica configuración del firewall bajo ninguna circunstancia. Ver [CLAUDE.md](CLAUDE.md).

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Python 3.11+, FastAPI, uvicorn, aiosqlite, pysnmp, APScheduler |
| Frontend | React 18, Vite, TypeScript, Tailwind v4 (CSS-first), ECharts, Zustand, lucide-react |
| Persistencia | SQLite WAL |
| Build | Vite compila a `backend/static/`, FastAPI sirve todo |
| Design | Agiotech design system (paleta teal/cyan + indigo, light/dark) |

---

## Qué resuelve

- Detectar caídas de WAN (las 3 enlaces) en segundos, no por reporte de usuario.
- Graficar consumo histórico de subida/bajada por interfaz WAN y LAN.
- Identificar qué host o qué interfaz está saturando un enlace en un momento dado.
- Vigilar salud general del firewall: CPU, memoria, sesiones, túneles VPN.
- Capturar eventos críticos (rechazos masivos, ataques a WAN, intentos a puertos sensibles).
- Alertar (correo / webhook / Telegram) ante condiciones definidas.

---

## Estructura

```
dashboard/
├── CLAUDE.md                     # reglas operativas no negociables
├── README.md                     # este archivo
├── docs/                         # documentación de planeación
├── backend/                      # FastAPI + SQLite + pollers
│   ├── requirements.txt
│   ├── .env.example
│   ├── app/
│   └── data/                     # SQLite + backups (gitignored)
└── frontend/                     # React + Vite + ECharts
    ├── package.json
    ├── index.html
    └── src/
```

Detalle completo en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

---

## Índice de documentación

| Documento | Contenido |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Reglas operativas no negociables — read-only, design system, .env |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Diagrama de componentes, monorepo, capas, flujos |
| [docs/FUENTES_DATOS.md](docs/FUENTES_DATOS.md) | SNMP OIDs, formato Syslog Zyxel, NetFlow v9 |
| [docs/METRICAS.md](docs/METRICAS.md) | Catálogo de métricas, KPIs, rollups, retención |
| [docs/DASHBOARD.md](docs/DASHBOARD.md) | Paneles del dashboard, layouts, endpoints API |
| [docs/GRAFICAS_ADICIONALES.md](docs/GRAFICAS_ADICIONALES.md) | Gráficas extra recomendadas (heatmaps, sankey, geo, etc.) |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Paleta, tipografía, tema ECharts, componentes Agiotech |
| [docs/ALERTAS.md](docs/ALERTAS.md) | Reglas, severidades, canales (email/webhook/Telegram) |
| [docs/CONFIG_FIREWALL.md](docs/CONFIG_FIREWALL.md) | Pasos manuales del usuario en el USG (SNMP, Syslog, NetFlow) |
| [docs/CONFIG.md](docs/CONFIG.md) | Catálogo completo de variables `.env` |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Fases de implementación, ~8 días total, MVP en 3 |

---

## Quickstart

### 0. Pre-requisito: habilitar lectura en el USG

Seguir [docs/CONFIG_FIREWALL.md](docs/CONFIG_FIREWALL.md): SNMPv3 + Syslog remoto. Manualmente, por el usuario. **Nada que hacer aún si quieres validar la UI primero — usa `MOCK_MODE=true`.**

### 1. Backend

```powershell
cd dashboard/backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

copy .env.example .env
# editar .env con FIREWALL_HOST, SNMP_*, etc. (o dejar MOCK_MODE=true)

uvicorn app.main:app --host 0.0.0.0 --port 8088 --reload
```

### 2. Frontend (dev con HMR)

```powershell
cd dashboard/frontend
npm install
npm run dev
# http://localhost:5173 con proxy al backend en :8088
```

### 3. Producción (un solo proceso)

```powershell
cd dashboard/frontend
npm run build              # genera backend/static/

cd ../backend
uvicorn app.main:app --host 0.0.0.0 --port 8088
# http://<servidor>:8088
```

---

## Topología asumida

- 1 firewall **Zyxel USG Flex 700H** en `192.168.2.1` (configurable vía `FIREWALL_HOST`).
- **3 WAN** activas (típico: dos Telmex + un secundario). Nombres reales en `WAN_INTERFACES`.
- Múltiples VLAN/subredes detrás (visto en logs: `192.168.1.0/24`, `192.168.2.0/24`, `192.168.3.0/24`, `192.168.5.0/24`, `192.168.20.0/24`).
- Túneles **IPSec site-to-site** hacia sucursales (GDL, PERISUR, BUENAVISTA, CONSTITUYENTES, ANDARES, ANGELOPOLIS, DELTA, ZOCALO, LOPEZ, VALLEORIENTE, ANTEA, …).

---

## Glosario corto

- **WAN**: enlace a internet del firewall.
- **SNMP**: Simple Network Management Protocol — extraer contadores y estados.
- **Syslog**: protocolo de logging que el firewall empuja al colector.
- **NetFlow**: exportación de metadatos por flujo (quién habla con quién, cuánto).
- **DPD**: Dead Peer Detection — heartbeat entre extremos de VPN IPSec.
- **OID**: Object Identifier — "dirección" jerárquica de una métrica SNMP.
- **DDM**: Digital Diagnostic Monitoring — métricas internas de un transceiver SFP (potencia óptica, temp).
- **WAL**: Write-Ahead Logging — modo de SQLite que permite lectores concurrentes con un escritor.
