# Variables de entorno (.env)

Catálogo único y autoritativo de todas las variables que controlan el dashboard.

> Regla operativa ([CLAUDE.md](../CLAUDE.md)): **todo** valor configurable vive aquí. Nada se hardcodea.

---

## Cómo se cargan

- Archivo `.env` en la raíz del proyecto (`dashboard/.env`).
- Cargadas por `pydantic-settings` en [`app/config.py`](../app/config.py).
- Variables del SO tienen precedencia sobre `.env`.
- `.env` está en `.gitignore`. Solo se comitea `.env.example`.

```python
from app.config import settings
settings.firewall_host   # tipado, validado
```

---

## Catálogo

### Firewall / SNMP

| Variable | Tipo | Default | Sensible | Descripción |
|---|---|---|---|---|
| `FIREWALL_HOST` | str | `192.168.2.1` | no | IP o hostname del USG Flex 700H |
| `SNMP_VERSION` | `v2c`\|`v3` | `v3` | no | Versión SNMP. Producción: v3 |
| `SNMP_USER` | str | `monitor` | no | Usuario SNMPv3 |
| `SNMP_AUTH_KEY` | str | — | **sí** | Contraseña auth SHA |
| `SNMP_PRIV_KEY` | str | — | **sí** | Contraseña priv AES |
| `SNMP_AUTH_PROTO` | `SHA`\|`MD5` | `SHA` | no | Proto auth |
| `SNMP_PRIV_PROTO` | `AES`\|`DES` | `AES` | no | Proto priv |
| `SNMP_COMMUNITY` | str | `public` | no | Solo si `SNMP_VERSION=v2c` |
| `SNMP_PORT` | int | `161` | no | Puerto UDP |
| `SNMP_TIMEOUT_S` | int | `3` | no | Timeout por request |
| `SNMP_RETRIES` | int | `2` | no | Reintentos por request |

### Polling

| Variable | Tipo | Default | Descripción |
|---|---|---|---|
| `POLL_INTERVAL_SECONDS` | int | `30` | Frecuencia del poller principal |
| `POLL_INTERVAL_SFP_SECONDS` | int | `300` | Polling SFP/DDM (lento) |
| `POLL_INTERVAL_VPN_SECONDS` | int | `60` | Polling VPN |

### Topología

| Variable | Tipo | Default | Descripción |
|---|---|---|---|
| `WAN_INTERFACES` | csv | `wan1,wan2,wan3` | Nombres exactos según el USG |
| `LAN_INTERFACES` | csv | `lan1,lan2,lan3,lan4` | Puertos LAN a graficar |
| `SFP_INTERFACES` | csv | `sfp1,sfp2` | Puertos SFP a graficar |
| `WAN_LABELS` | json | `{}` | Etiquetas amigables, ej. `{"wan1":"Telmex Principal"}` |
| `SESSION_LIMIT_PER_HOST` | int | `8000` | Valor actual del cap del firewall (para calcular % de saturación por host) |

### Syslog

| Variable | Tipo | Default | Descripción |
|---|---|---|---|
| `SYSLOG_BIND_HOST` | str | `0.0.0.0` | IP en la que escucha |
| `SYSLOG_BIND_PORT` | int | `514` | Puerto UDP |
| `SYSLOG_MIN_SEVERITY` | int | `5` | Severidad mínima a persistir (5=notice) |
| `SYSLOG_ALLOWED_SOURCES` | csv | `*` | Lista blanca de IPs origen. `*` = cualquiera |

### NetFlow (fase 2)

| Variable | Tipo | Default | Descripción |
|---|---|---|---|
| `NETFLOW_ENABLED` | bool | `false` | Activa el listener |
| `NETFLOW_BIND_HOST` | str | `0.0.0.0` | |
| `NETFLOW_BIND_PORT` | int | `2055` | |
| `NETFLOW_TOP_N` | int | `50` | Top N por minuto |

### Calidad de internet (ping activo)

| Variable | Tipo | Default | Descripción |
|---|---|---|---|
| `QUALITY_CHECK_ENABLED` | bool | `true` | Activa probes de latencia/loss |
| `QUALITY_CHECK_TARGETS` | csv | `1.1.1.1,8.8.8.8` | Destinos a pinguear |
| `QUALITY_CHECK_INTERVAL_S` | int | `30` | Periodo |
| `QUALITY_CHECK_COUNT` | int | `10` | Pings por ronda |

### API y UI

| Variable | Tipo | Default | Descripción |
|---|---|---|---|
| `API_HOST` | str | `0.0.0.0` | Bind del FastAPI |
| `API_PORT` | int | `8088` | Puerto HTTP |
| `API_BASE_PATH` | str | `` | Para correr atrás de reverse proxy con subpath |
| `UI_THEME_DEFAULT` | `light`\|`dark` | `dark` | Tema inicial |
| `UI_AUTO_REFRESH_S` | int | `30` | Refresco automático |

### Persistencia

| Variable | Tipo | Default | Descripción |
|---|---|---|---|
| `DB_PATH` | str | `./data/dashboard.db` | Ruta del SQLite |
| `RETENTION_DAYS_RAW` | int | `7` | Datos crudos 30s |
| `RETENTION_DAYS_5M` | int | `30` | Rollup 5 min |
| `RETENTION_DAYS_1H` | int | `365` | Rollup 1 h |
| `RETENTION_DAYS_EVENTS` | int | `30` | Eventos syslog |

### Modo

| Variable | Tipo | Default | Descripción |
|---|---|---|---|
| `MOCK_MODE` | bool | `true` | Datos sintéticos en lugar de SNMP real |
| `LOG_LEVEL` | str | `INFO` | DEBUG/INFO/WARNING/ERROR |

### Alertas — núcleo

| Variable | Tipo | Default | Descripción |
|---|---|---|---|
| `ALERT_EVAL_INTERVAL_S` | int | `60` | Frecuencia de evaluación de reglas |
| `ALERT_GLOBAL_SILENCED` | bool | `false` | Pánico silencioso |

### Alertas — email

| Variable | Tipo | Default | Sensible |
|---|---|---|---|
| `ALERT_EMAIL_ENABLED` | bool | `false` | no |
| `ALERT_EMAIL_SMTP_HOST` | str | — | no |
| `ALERT_EMAIL_SMTP_PORT` | int | `587` | no |
| `ALERT_EMAIL_SMTP_USER` | str | — | no |
| `ALERT_EMAIL_SMTP_PASS` | str | — | **sí** |
| `ALERT_EMAIL_FROM` | str | — | no |
| `ALERT_EMAIL_TO` | csv | — | no |
| `ALERT_EMAIL_MIN_SEVERITY` | `LOW`\|`MEDIUM`\|`HIGH`\|`CRITICAL` | `MEDIUM` | no |

### Alertas — webhook

| Variable | Tipo | Default | Sensible |
|---|---|---|---|
| `ALERT_WEBHOOK_ENABLED` | bool | `false` | no |
| `ALERT_WEBHOOK_URL` | str | — | **sí** |
| `ALERT_WEBHOOK_FORMAT` | `slack`\|`teams`\|`generic` | `slack` | no |
| `ALERT_WEBHOOK_MIN_SEVERITY` | enum | `HIGH` | no |

### Alertas — Telegram

| Variable | Tipo | Default | Sensible |
|---|---|---|---|
| `ALERT_TELEGRAM_ENABLED` | bool | `false` | no |
| `ALERT_TELEGRAM_BOT_TOKEN` | str | — | **sí** |
| `ALERT_TELEGRAM_CHAT_ID` | str | — | no |

---

## Ejemplo `.env` mínimo para producción

```env
# Conexión al firewall
FIREWALL_HOST=192.168.2.1
SNMP_VERSION=v3
SNMP_USER=monitor
SNMP_AUTH_KEY=Sup3rS3cret_Auth!
SNMP_PRIV_KEY=Sup3rS3cret_Priv!

# Modo real, no mock
MOCK_MODE=false

# Topología
WAN_INTERFACES=wan1,wan2,wan3
WAN_LABELS={"wan1":"Telmex Principal","wan2":"Telmex Secundario","wan3":"Backup"}
SESSION_LIMIT_PER_HOST=8000

# API
API_PORT=8088

# Alertas
ALERT_EMAIL_ENABLED=true
ALERT_EMAIL_SMTP_HOST=smtp.empresa.com
ALERT_EMAIL_SMTP_USER=alerts@empresa.com
ALERT_EMAIL_SMTP_PASS=...
ALERT_EMAIL_TO=ti@empresa.com
```

---

## Cómo agregar una variable nueva

1. Editar `app/config.py` — agregar el atributo a `Settings` con tipo y default.
2. Editar `.env.example` — agregar la línea con un valor placeholder y comentario corto.
3. Editar este documento (`docs/CONFIG.md`) — agregarla a la tabla correspondiente.
4. Si es sensible, marcarla como `**sí**` en la columna Sensible.

Si no se hace el paso 3, el cambio queda fuera de la documentación y otros (o tú mismo en 3 meses) no van a saber qué hace esa variable.
