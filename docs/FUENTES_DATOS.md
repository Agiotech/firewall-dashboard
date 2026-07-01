# Fuentes de datos

Tres canales independientes alimentan el dashboard:

| Canal | Dirección | Protocolo | Datos |
|---|---|---|---|
| SNMP | Pull (poller -> firewall) | UDP/161, v3 | Métricas numéricas en tiempo real |
| Syslog | Push (firewall -> servidor) | UDP/514 | Eventos y mensajes |
| NetFlow v9 | Push (firewall -> servidor) | UDP/2055 | Metadatos por flujo |

---

## 1. SNMP

### Versión y autenticación

Producción: **SNMPv3** con `authPriv` (SHA + AES). v2c queda solo para laboratorio.

Configurable vía `.env` (ver [CONFIG.md](CONFIG.md)):
```
SNMP_VERSION=v3
SNMP_USER=monitor
SNMP_AUTH_PROTO=SHA
SNMP_AUTH_KEY=...
SNMP_PRIV_PROTO=AES
SNMP_PRIV_KEY=...
```

### OIDs a consultar

#### Sistema (MIB-II + HOST-RESOURCES)

| OID | Nombre | Uso |
|---|---|---|
| `1.3.6.1.2.1.1.3.0` | sysUpTime | Uptime del equipo |
| `1.3.6.1.2.1.1.5.0` | sysName | Nombre del equipo |
| `1.3.6.1.2.1.25.3.3.1.2` | hrProcessorLoad | CPU por core |
| `1.3.6.1.2.1.25.2.3.1.5` | hrStorageSize | Memoria/storage total |
| `1.3.6.1.2.1.25.2.3.1.6` | hrStorageUsed | Memoria/storage usado |

#### Interfaces (ifTable / ifXTable)

| OID | Nombre | Uso |
|---|---|---|
| `1.3.6.1.2.1.2.2.1.2` | ifDescr | Nombre interfaz (wan1, lan1, …) |
| `1.3.6.1.2.1.2.2.1.7` | ifAdminStatus | up/down administrativo |
| `1.3.6.1.2.1.2.2.1.8` | ifOperStatus | up/down operativo |
| `1.3.6.1.2.1.31.1.1.1.6` | ifHCInOctets | Bytes entrada (64-bit) |
| `1.3.6.1.2.1.31.1.1.1.10` | ifHCOutOctets | Bytes salida (64-bit) |
| `1.3.6.1.2.1.31.1.1.1.7` | ifHCInUcastPkts | Paquetes entrada |
| `1.3.6.1.2.1.31.1.1.1.11` | ifHCOutUcastPkts | Paquetes salida |
| `1.3.6.1.2.1.2.2.1.14` | ifInErrors | Errores entrada |
| `1.3.6.1.2.1.2.2.1.20` | ifOutErrors | Errores salida |
| `1.3.6.1.2.1.2.2.1.13` | ifInDiscards | Descartes entrada |
| `1.3.6.1.2.1.2.2.1.19` | ifOutDiscards | Descartes salida |
| `1.3.6.1.2.1.31.1.1.1.15` | ifHighSpeed | Velocidad negociada (Mbps) |

#### Zyxel propietario (rama 1.3.6.1.4.1.890)

Los OIDs exactos varían por firmware. Confirmarlos con `snmpwalk` contra el equipo durante setup. Categorías relevantes:

| Categoría | Rama base aproximada |
|---|---|
| Sesiones por host | `1.3.6.1.4.1.890.1.6.22` |
| Estado VPN IPSec | `1.3.6.1.4.1.890.1.6.22.2` |
| Temperatura / fans | `1.3.6.1.4.1.890.1.6.22.1.10` |
| SFP DDM (señal óptica) | `1.3.6.1.4.1.890.1.15.3.96` |

> **Tarea de bootstrap:** correr `snmpwalk -v3 ... 1.3.6.1.4.1.890` y dejar el dump en `docs/snmpwalk-zyxel.txt` para resolver los OIDs reales del firmware instalado.

### Periodicidad

- Polling principal: `POLL_INTERVAL_SECONDS` (default 30s).
- Polling SFP DDM (lento, costoso): cada 5 minutos.
- Polling VPN (varios túneles, walk grande): cada 60s.

### Cálculo de bps / pps

Los contadores SNMP son cumulativos (octets, packets totales desde que arrancó la interfaz). El bps se calcula como:

```
bps = (octets_actual - octets_previo) * 8 / (ts_actual - ts_previo)
```

Hay que manejar:
- Reset de contadores (interfaz reiniciada): si delta < 0, descartar muestra.
- Wrap de 32-bit: usar exclusivamente contadores `HC` (64-bit) de `ifXTable`.

---

## 2. Syslog

### Formato típico Zyxel USG

```
<189>May 22 14:13:21 USGFLEX700H src="192.168.20.9" dst="192.168.1.10" \
     msg="Match default rule DROP" note="ACCESS BLOCK" \
     ser="..." cat="Security Policy Control"
```

El número entre `<>` codifica facility + severity (PRI). En Zyxel:
- `0`=emerg, `1`=alert, `2`=crit, `3`=err, `4`=warning, `5`=notice, `6`=info, `7`=debug.

### Categorías observadas en el log analizado

- `Session Control` (rechazos por max-session-per-host)
- `Security Policy Control` (matches de reglas, default DROP)
- `IPSec VPN` (DPD, IKE_SA_INIT, errores)
- `User` (login/logout admin)
- `DHCP` (Offer/Request/Ack/Release)
- `Connectivity Check` (alertas DEAD/ALIVE de WAN)

### Parser

Implementado en `app/parsers.py`. Hace:

1. Extrae PRI del prefijo `<N>`.
2. Lee `cat=`, `msg=`, `src=`, `dst=`, `srcPort=`, `dstPort=`, `note=`, `action=`.
3. Normaliza a la fila de `events`.
4. Si la categoría es `Connectivity Check` y el mensaje contiene `DEAD`/`ALIVE`, también escribe en `wan_status_changes`.

### Filtros recomendados

- Severidad mínima a registrar: `notice` (severity ≤ 5).
- Eventos `info` se mantienen en memoria 60s para correlación pero **no** se persisten todos (volumen alto).
- Categoría `Session Control` con priority `warning` se cuenta agregada pero no se almacena por línea — el último análisis mostró 1630 líneas idénticas en 1 minuto.

---

## 3. NetFlow v9 (fase 2)

Permite responder: **"¿qué host está saturando wan2 ahora?"** y **"¿a qué destinos va el 80% del tráfico?"**.

### Templates esperados

El USG exporta v9 con campos:

| Field ID | Nombre | Uso |
|---|---|---|
| 8 | IPV4_SRC_ADDR | Top talkers origen |
| 12 | IPV4_DST_ADDR | Top talkers destino |
| 7 | L4_SRC_PORT | — |
| 11 | L4_DST_PORT | Clasificar app (53=DNS, 443=HTTPS, …) |
| 4 | PROTOCOL | TCP/UDP/ICMP |
| 1 | IN_BYTES | Volumen |
| 2 | IN_PKTS | Paquetes |
| 10 | INPUT_SNMP | Interfaz entrada |
| 14 | OUTPUT_SNMP | Interfaz salida |

### Agregación

El listener mantiene en memoria ventanas de 60s y vuelca a SQLite:

| Tabla | Granularidad | Top N |
|---|---|---|
| `top_talkers_src` | 1 min | 50 |
| `top_talkers_dst` | 1 min | 50 |
| `top_apps` | 1 min | 30 |

Top N evita explosión de cardinalidad.

### Limitaciones

- NetFlow muestrea por defecto; el rate de muestreo depende del modelo. Puede sub-representar flujos cortos.
- Si el firmware del USG Flex 700H no exporta NetFlow nativo, esta vía queda en backlog hasta validar capability.
