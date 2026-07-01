# Configuración del firewall (acciones manuales del usuario)

> **Este documento describe cambios que el usuario aplica manualmente en el USG Flex 700H.**
> El dashboard NO modifica configuración del firewall — ver [CLAUDE.md](../CLAUDE.md).

Todos los pasos asumen acceso a la UI web del USG en `https://192.168.2.1` con cuenta admin.

---

## 1. Habilitar SNMPv3 (lectura)

### UI: `Configuration → System → SNMP`

1. **Enable SNMP**: ON.
2. **Service Port**: 161 (default).
3. **GET Community**: dejar vacío (no usar v2c).
4. **Trap Community**: dejar vacío.
5. **SNMPv3 User**: crear uno nuevo.
   - **User Name**: `monitor`
   - **Authentication**: SHA, contraseña fuerte (mínimo 12 chars, mezcla). **Anótala — irá en `.env` como `SNMP_AUTH_KEY`.**
   - **Privacy**: AES, contraseña fuerte. **Anótala — `SNMP_PRIV_KEY`.**
   - **Privilege**: Read-Only (importante).
6. **Service Control**: restringir el acceso a la IP del servidor del dashboard.
   - Crear objeto `HOST-DASHBOARD = <IP del servidor>`.
   - En la tabla de Service Control, agregar regla: `Address=HOST-DASHBOARD, Service=SNMP, Action=Accept`. Mover arriba de las reglas más generales.
7. **Apply**.

### Validación

Desde el servidor del dashboard:

```powershell
# Instalar Net-SNMP en Windows o usar pysnmp directamente.
# Prueba rápida con pysnmp:
py -c "from pysnmp.hlapi import *; r=next(getCmd(SnmpEngine(), UsmUserData('monitor','TU_AUTH','TU_PRIV',authProtocol=usmHMACSHAAuthProtocol,privProtocol=usmAesCfb128Protocol), UdpTransportTarget(('192.168.2.1',161)), ContextData(), ObjectType(ObjectIdentity('1.3.6.1.2.1.1.5.0')))); print(r)"
```

Debe devolver el `sysName` del firewall, no un timeout.

---

## 2. Habilitar Syslog server remoto

### UI: `Configuration → Log & Report → Log Setting → Remote Server`

1. Click en `Add` (o editar uno existente).
2. **Server Name**: `DASHBOARD-SYSLOG`.
3. **Log Format**: CEF/Syslog o el formato propietario que ya usa el equipo (el log analizado parece formato Zyxel estándar con `cat=`, `msg=`, `src=`, `dst=`).
4. **Server Address**: IP del servidor del dashboard.
5. **UDP Port**: 514 (default).
6. **Log Facility**: cualquiera (típico Local0).
7. **Active**: ON.
8. **Apply**.

### Categorías a enviar

En la misma sección, configurar qué categorías van al servidor remoto:

| Categoría | Severidad mínima | Justificación |
|---|---|---|
| Security Policy Control | notice | drops a WAN, política inter-VLAN |
| Session Control | warning | host saturando, max-sessions |
| IPSec VPN | notice | DPD, IKE, túneles caídos |
| Connectivity Check | notice | WAN DEAD/ALIVE |
| User | notice | logins admin |
| System | notice | reinicios, cambios de hardware |
| DHCP | info opcional | si quieres trazar IPs asignadas |

Severidad `info` por categoría puede generar mucho volumen; arrancar con `notice` y subir si hace falta.

### Firewall del servidor

En el servidor donde corra el dashboard, abrir entrada en UDP/514 únicamente desde la IP del firewall.

---

## 3. Habilitar NetFlow v9 (fase 2)

### UI: `Configuration → System → NetFlow` (la ruta exacta varía por firmware; puede estar bajo `Object → Profile → NetFlow`)

1. **Enable NetFlow**: ON.
2. **Version**: 9 o IPFIX.
3. **Collector Address**: IP del servidor del dashboard.
4. **Collector Port**: 2055 (default; configurable en `.env` como `NETFLOW_BIND_PORT`).
5. **Active Timeout**: 60s (envía flujos activos cada 60s).
6. **Inactive Timeout**: 15s.
7. **Sampling**: 1:1 si el modelo lo permite, o el mínimo configurable.
8. **Source Interfaces**: seleccionar las 3 WAN y los puertos LAN troncales.
9. **Apply**.

> Si el USG Flex 700H del firmware actual no expone NetFlow, esta función queda en backlog. Validar disponibilidad antes de implementar el listener.

---

## 4. Connectivity Check (ya activo, validar)

### UI: `Configuration → Network → Interface → Trunk` o por interfaz

Asegurar que cada WAN tenga:

1. **Connectivity Check**: ON.
2. **Check Method**: ICMP.
3. **Check Address**: `1.1.1.1` (primario) y `8.8.8.8` (secundario).
4. **Probe Interval**: 30s.
5. **Probe Fail Tolerance**: 3.

Cuando la WAN cae, el firewall escribe en syslog:
```
Connectivity Check | The link status of <interface> interface is DEAD.
```

Eso es lo que el dashboard captura para `WAN_DOWN`.

---

## 5. Permisos NTP

El timestamping de syslog y de las métricas SNMP depende de que el reloj del firewall esté sincronizado.

### UI: `Configuration → System → Date/Time`

1. **Time Server**: `pool.ntp.org` o `time.cloudflare.com`.
2. **Time Zone**: la correcta de la zona.
3. **Apply**.

---

## 6. Verificación final

Lista de chequeo antes de arrancar el dashboard apuntando al firewall real:

- [ ] SNMPv3 responde a `sysName` desde la IP del servidor.
- [ ] Syslog llega: en el servidor, `tcpdump -i any port 514` muestra paquetes UDP.
- [ ] NetFlow llega (si aplica): `tcpdump -i any port 2055`.
- [ ] Hora del firewall sincronizada con NTP.
- [ ] Las 3 WAN tienen Connectivity Check activo.
- [ ] El usuario SNMP es Read-Only (importante: si por error se creó como Read-Write, recrearlo).

---

## 7. Lo que NO se hace desde este documento

Para que quede explícito:

- No se crean reglas de policy.
- No se cambian objetos.
- No se modifican interfaces.
- No se toca enrutamiento, NAT, VPN.
- No se actualiza firmware.
- No se reinicia el equipo.

Cualquier cambio de esta naturaleza es responsabilidad del administrador, no del dashboard.
