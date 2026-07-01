# Alertas

Reglas de detección, severidades y canales de notificación.

---

## Severidades

| Nivel | Cuándo | Color |
|---|---|---|
| **CRITICAL** | Servicio crítico caído ahora (ej. todas las WAN down, firewall inalcanzable) | Rojo |
| **HIGH** | Un elemento crítico individual caído (1 WAN, túnel VPN principal) | Rojo claro |
| **MEDIUM** | Degradación significativa pero no caída (saturación >85%, latencia alta, picos de drops) | Amarillo |
| **LOW** | Anomalía a vigilar (uso creciente, host cerca del session limit) | Azul |

---

## Reglas

Definidas como código en `app/alerts.py`. Cada regla:
- Se evalúa cada `ALERT_EVAL_INTERVAL_SECONDS` (default 60).
- Tiene un `state` que persiste entre evaluaciones (firing / resolved).
- Genera evento `alert_open`/`alert_close` al cambiar de estado.
- Notifica por los canales habilitados.

### Conectividad WAN

| ID | Severidad | Condición | Notas |
|---|---|---|---|
| `WAN_DOWN` | HIGH | `oper_status=0` por más de 60s | Una WAN caída |
| `WAN_ALL_DOWN` | CRITICAL | Todas las WANs `oper_status=0` por más de 30s | Sin internet |
| `WAN_FLAPPING` | MEDIUM | ≥3 cambios up/down en 10 min | Enlace inestable |
| `WAN_HIGH_LOSS` | MEDIUM | `packet_loss_pct > 5` durante 5 min | Calidad pésima |
| `WAN_HIGH_LATENCY` | LOW | `latency_ms > 100` durante 5 min | |
| `WAN_SATURATION` | MEDIUM | `utilization_in_pct > 85` o `utilization_out_pct > 85` durante 5 min | Cuello |

### Salud del firewall

| ID | Severidad | Condición |
|---|---|---|
| `FW_UNREACHABLE` | CRITICAL | El poller SNMP falla 3 veces consecutivas |
| `FW_HIGH_CPU` | MEDIUM | `cpu_pct > 80` durante 5 min |
| `FW_HIGH_MEM` | MEDIUM | `mem_used_pct > 85` durante 5 min |
| `FW_HIGH_SESSIONS` | MEDIUM | `sessions_total > 80% de capacidad` |
| `FW_TEMP_HIGH` | HIGH | `temperature_c > 70` |

### Sesiones por host

| ID | Severidad | Condición |
|---|---|---|
| `HOST_NEAR_LIMIT` | LOW | Algún host con `sessions_now > 0.8 * SESSION_LIMIT_PER_HOST` |
| `HOST_HIT_LIMIT` | MEDIUM | Host con `rejected_due_to_limit > 0` en la última ventana |

### VPN

| ID | Severidad | Condición |
|---|---|---|
| `VPN_DOWN` | HIGH | Túnel marcado UP cae a DOWN |
| `VPN_REKEY_STORM` | LOW | `rekeys_last_hour > 6` |
| `VPN_NO_TRAFFIC` | LOW | Túnel UP pero `bytes_in/out = 0` durante 30 min (posible bug ruteo) |

### SFP / fibra

| ID | Severidad | Condición |
|---|---|---|
| `SFP_LOW_RX` | MEDIUM | `rx_power_dbm < -22` |
| `SFP_HIGH_TEMP` | MEDIUM | `temperature_c > 70` |
| `SFP_REMOVED` | HIGH | SFP que existía deja de reportarse |

### Seguridad (eventos)

| ID | Severidad | Condición |
|---|---|---|
| `WAN_ATTACK_BURST` | MEDIUM | `wan_attacks_per_min > 30` últimos 5 min |
| `PORT_SCAN` | MEDIUM | Una IP externa intenta >20 puertos distintos en 10 min |
| `ADMIN_LOGIN_OUTSIDE_HOURS` | LOW | login admin fuera de horario configurado |
| `ADMIN_LOGIN_FAIL_BURST` | HIGH | >5 logins fallidos en 5 min |

### LAN

| ID | Severidad | Condición |
|---|---|---|
| `LAN_PORT_DOWN` | LOW | Puerto LAN baja (puede ser normal: PC apagada) |
| `LAN_PORT_HALF_DUPLEX` | MEDIUM | Negoció half duplex |
| `LAN_PORT_LOW_SPEED` | LOW | Puerto a 100M cuando históricamente fue 1G |
| `LAN_PORT_ERRORS` | MEDIUM | `errors_in/out > 100/min` |

---

## Lógica anti-ruido

- **Hysteresis**: una regla pasa a `firing` solo si la condición se sostiene durante `for` segundos (definido por regla). Se cierra solo si la condición desaparece durante `clear_for` segundos (default 60).
- **Agrupación**: alertas del mismo tipo dentro de 60s se agrupan en una sola notificación.
- **Silenciamiento**: ventanas de mantenimiento configurables (`alerts_silence` en DB) que suprimen reglas específicas.
- **Snooze**: el usuario puede silenciar una alerta activa por N horas desde la UI.

---

## Canales de notificación

Configurables por `.env`:

### Email

```
ALERT_EMAIL_ENABLED=true
ALERT_EMAIL_SMTP_HOST=smtp.gmail.com
ALERT_EMAIL_SMTP_PORT=587
ALERT_EMAIL_SMTP_USER=alerts@empresa.com
ALERT_EMAIL_SMTP_PASS=
ALERT_EMAIL_TO=ti@empresa.com,oncall@empresa.com
ALERT_EMAIL_MIN_SEVERITY=MEDIUM
```

### Webhook (Slack/Teams/Discord/genérico)

```
ALERT_WEBHOOK_ENABLED=true
ALERT_WEBHOOK_URL=https://hooks.slack.com/...
ALERT_WEBHOOK_MIN_SEVERITY=HIGH
```

### Telegram (opcional)

```
ALERT_TELEGRAM_ENABLED=false
ALERT_TELEGRAM_BOT_TOKEN=
ALERT_TELEGRAM_CHAT_ID=
```

### UI in-app

Siempre activa. Sección "Active alerts" en el dashboard.

---

## Formato del mensaje

Email/webhook unificado:

```
[HIGH] WAN_DOWN
WAN: P2-Telmex2
Down since: 2026-05-22 14:12:15
Duration: 12m 4s
Last bps_in: 0
Failover count (24h): 3

Dashboard: http://dashboard.local:8088/wan/P2-Telmex2
```

---

## Persistencia de alertas

Tabla `alerts`:

| Columna | Tipo |
|---|---|
| `id` | int |
| `rule_id` | text (`WAN_DOWN`, etc.) |
| `severity` | text |
| `subject_kind` | text (`wan`, `vpn`, `host`, `port`, `system`) |
| `subject_ref` | text (nombre/id del sujeto) |
| `state` | text (`firing`, `resolved`) |
| `started_at` | int (ts) |
| `resolved_at` | int? |
| `message` | text |
| `details_json` | text |

Permite construir un timeline de incidentes y calcular MTTR/MTBF por regla.
