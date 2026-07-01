# Métricas

Catálogo de métricas que se capturan y cómo se agregan.

---

## Categorías

| Categoría | Fuente | Persistencia |
|---|---|---|
| Estado de enlaces WAN | SNMP + Syslog | `wan_metrics` + `wan_status_changes` |
| Tráfico por interfaz | SNMP | `if_metrics` con rollups |
| Salud del firewall | SNMP | `system_metrics` |
| Sesiones | SNMP + Syslog | `session_metrics` |
| Túneles VPN | SNMP + Syslog | `vpn_status` |
| Top hosts (LAN -> WAN) | NetFlow | `top_talkers_*` |
| Top destinos (WAN externa) | NetFlow | `top_talkers_*` |
| Top aplicaciones / puertos | NetFlow | `top_apps` |
| Eventos de seguridad | Syslog | `events` |
| SFP / fibra | SNMP DDM | `sfp_metrics` |
| Calidad de internet (latencia/loss) | Ping desde el dashboard | `internet_quality` |

---

## Detalle por métrica

### 1. WAN — estado y tráfico

Por cada interfaz en `WAN_INTERFACES`:

| Métrica | Unidad | Granularidad | Origen |
|---|---|---|---|
| `oper_status` | up=1 / down=0 | Cada poll | `ifOperStatus` |
| `admin_status` | up=1 / down=0 | Cada poll | `ifAdminStatus` |
| `bps_in` | bits/s | 30s | delta `ifHCInOctets` |
| `bps_out` | bits/s | 30s | delta `ifHCOutOctets` |
| `pps_in` | pkts/s | 30s | delta `ifHCInUcastPkts` |
| `pps_out` | pkts/s | 30s | delta `ifHCOutUcastPkts` |
| `errors_in` | count/s | 30s | delta `ifInErrors` |
| `errors_out` | count/s | 30s | delta `ifOutErrors` |
| `discards_in` | count/s | 30s | delta `ifInDiscards` |
| `discards_out` | count/s | 30s | delta `ifOutDiscards` |
| `link_speed_mbps` | Mbps | Cada poll | `ifHighSpeed` |
| `utilization_in_pct` | % | derivada | `bps_in / (link_speed*1e6) * 100` |
| `utilization_out_pct` | % | derivada | `bps_out / (link_speed*1e6) * 100` |
| `latency_ms` | ms | 30s | ping desde el server al gateway upstream |
| `packet_loss_pct` | % | 30s | ping (10 pings, % perdido) |

### 2. LAN — puertos físicos

Misma lista que WAN para cada `LAN_INTERFACES`, salvo latencia/loss.

Adicional para puertos LAN:

| Métrica | Unidad | Uso |
|---|---|---|
| `duplex` | full/half | Detectar negociación a half (problema cable) |
| `negotiated_speed_mbps` | Mbps | Detectar puerto a 100M cuando debería ser 1G |

### 3. SFP / Fibra (si el USG Flex 700H tiene SFP poblados)

Solo si el firmware expone DDM (Digital Diagnostic Monitoring) por SNMP.

| Métrica | Unidad | Umbral típico de alarma |
|---|---|---|
| `tx_power_dbm` | dBm | < -8 advertencia |
| `rx_power_dbm` | dBm | < -22 advertencia |
| `temperature_c` | °C | > 70 advertencia |
| `voltage_v` | V | fuera 3.0–3.6 |
| `bias_current_ma` | mA | fuera rango fabricante |

### 4. Sistema del firewall

| Métrica | Unidad | Origen |
|---|---|---|
| `cpu_pct` | % | `hrProcessorLoad` (promediado entre cores) |
| `mem_used_pct` | % | `hrStorage` (índice memoria física) |
| `sessions_total` | count | OID Zyxel `zyxelSessionTotal` |
| `sessions_tcp` | count | OID Zyxel desglose |
| `sessions_udp` | count | OID Zyxel desglose |
| `uptime_sec` | s | `sysUpTime / 100` |
| `temperature_c` | °C | OID Zyxel (si soporta) |
| `fan_rpm` | rpm | OID Zyxel (si soporta) |

### 5. Sesiones por host

Top 20 hosts por sesiones activas. Origen: OID Zyxel de sesiones-por-IP, o derivado de NetFlow.

| Métrica | Unidad |
|---|---|
| `sessions_now` | count |
| `sessions_peak_5m` | count |
| `sessions_peak_1h` | count |
| `rejected_due_to_limit` | count (delta) |

### 6. Túneles VPN IPSec

Por cada peer detectado en el log o por SNMP:

| Métrica | Unidad |
|---|---|
| `state` | UP / DOWN / NEGOTIATING |
| `phase2_sa_count` | count |
| `bytes_in_total` | bytes |
| `bytes_out_total` | bytes |
| `last_dpd_ok_ts` | timestamp |
| `rekeys_last_hour` | count |

### 7. Top talkers (NetFlow)

Por minuto, top N por bytes:

| Dimensión | Métrica |
|---|---|
| `src_ip` (interno) | bytes/s up, bytes/s down |
| `dst_ip` (externo) | bytes |
| `dst_port` / aplicación | bytes |
| `protocol` | bytes |

Aplicaciones resueltas por puerto bien conocido más un mapping editable en `apps.json` (ej. `443=HTTPS`, `5938=TeamViewer`, `3478=STUN`, `19302=Meet`).

### 8. Eventos de seguridad

Conteo por minuto:

| Métrica | Descripción |
|---|---|
| `events_per_min_by_priority` | warning/notice/info |
| `events_per_min_by_category` | Session Control, IPSec VPN, etc. |
| `drops_per_min` | matches a default DROP |
| `wan_attacks_per_min` | drops cuya `dst_ip` es la WAN pública |
| `port_scan_score` | heurística: muchos `dst_port` distintos desde una misma `src_ip` en ventana corta |

### 9. Calidad de internet

Mediciones activas hechas por el dashboard (no por el firewall):

| Métrica | Cómo |
|---|---|
| `latency_ms_target` | ping a `1.1.1.1`, `8.8.8.8`, `mx.google.com` cada 30s |
| `jitter_ms` | desviación estándar de ventana de 5min |
| `loss_pct` | % paquetes perdidos en ventana de 5min |
| `dns_resolve_ms` | tiempo de resolver dominios objetivo |
| `http_get_ms` | GET a URL externa con timeout |

> El dashboard pinguea desde su propio host. Si tiene **route por la misma WAN principal**, esto mide la calidad real que percibirían los usuarios.

---

## Rollups y retención

Para evitar que la base crezca sin control:

| Resolución | Retención | Tabla |
|---|---|---|
| 30s (raw) | 7 días | `*_metrics` |
| 5 min (avg/max) | 30 días | `*_metrics_5m` |
| 1 hora (avg/max) | 365 días | `*_metrics_1h` |

El `rollup_worker` corre cada minuto y agrega lo que esté completo. Las gráficas del dashboard eligen automáticamente la resolución según el rango pedido:

| Rango pedido | Resolución usada |
|---|---|
| Última hora | 30s |
| Últimas 24h | 5min |
| Últimos 7 días | 5min |
| Últimos 30 días | 1h |
| Más de 30 días | 1h |

---

## KPIs sintéticos (derivados)

| KPI | Fórmula | Para qué |
|---|---|---|
| **Disponibilidad WAN (%)** | tiempo con `oper_status=1` / tiempo total | SLA por enlace |
| **Saturación WAN (%)** | max(`utilization_in_pct`, `utilization_out_pct`) | Saber si el enlace es el cuello |
| **Failover events** | conteo de `wan_status_changes` por día | Estabilidad |
| **Tasa de drops** | `drops_per_min` últimas 24h | Indicador de exposición |
| **Túneles caídos** | `vpn_status WHERE state != UP` | Operación sucursales |
| **Hosts saturando límite** | `sessions_now / 8000 > 0.8` | Anticipar host que va a chocar |
