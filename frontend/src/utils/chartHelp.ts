export interface ChartHelp {
  title: string
  what: string
  dataSource: string
  formula: string
  interpretation: string[]
  caveats?: string[]
}

export const HELP_REGISTRY: Record<string, ChartHelp> = {
  // ============== OVERVIEW ==============
  'wan-traffic': {
    title: 'Tráfico WAN — bps por enlace',
    what: 'Volumen de tráfico de descarga y subida en bits/segundo para cada uno de los 3 enlaces WAN, en tiempo real.',
    dataSource: 'SNMP polling cada 30s a los contadores cumulativos ifHCInOctets (1.3.6.1.2.1.31.1.1.1.6) e ifHCOutOctets (1.3.6.1.2.1.31.1.1.1.10) del USG, usando counters de 64-bit.',
    formula: 'bps = (octets_actual − octets_anterior) × 8 / Δt segundos. Si delta < 0 (counter reset por reboot de la interfaz), la muestra se descarta para evitar picos falsos.',
    interpretation: [
      'Línea sólida = ↓ download. Línea punteada = ↑ upload.',
      'WAN1 = Telmex 1, WAN2 = Telmex 2, WAN3 = Kanguro (siempre mismos colores).',
      'Picos sostenidos > 80% del link speed = saturación, esperar problemas de latencia.',
      'Caídas a 0 = WAN inactiva, debería disparar alerta WAN_DOWN.',
      'Zoom: arrastra en la barra de abajo para acercar un rango específico.',
    ],
    caveats: [
      'Los counters HC (high-capacity, 64-bit) no sufren wraparound dentro de tu vida útil — son confiables.',
      'Mide al firewall, no al CPE de Telmex. Si el problema está río arriba, aquí no se verá.',
    ],
  },

  'system-metrics': {
    title: 'Salud del firewall — CPU, MEM, sesiones',
    what: 'Carga de CPU, uso de memoria y conteo total de sesiones activas del firewall a lo largo del tiempo.',
    dataSource: 'SNMP polling cada 30s a HOST-RESOURCES MIB: hrProcessorLoad (1.3.6.1.2.1.25.3.3.1.2) para CPU por core, hrStorage (1.3.6.1.2.1.25.2.3.1.5/6) para memoria, y OID propietario Zyxel para conteo de sesiones.',
    formula: 'CPU = promedio de cores. MEM = used / size × 100 (del índice de memoria física). Sesiones = lectura directa del OID.',
    interpretation: [
      'CPU > 80% sostenido durante 5+ min dispara alerta FW_HIGH_CPU.',
      'MEM > 85% dispara FW_HIGH_MEM — puede indicar memory leak o tabla de sesiones llena.',
      'Sesiones cerca del cap global (~1M) = todo el firewall saturado. Por host el cap es SESSION_LIMIT_PER_HOST.',
      'Memoria creciendo monotónicamente entre reinicios = leak.',
    ],
    caveats: [
      'CPU SNMP es un snapshot instantáneo cada 30s — puede ocultar picos cortos.',
      'Algunos firmwares de Zyxel reportan CPU con suavizado interno (rolling avg) — los picos aparecen amortiguados.',
    ],
  },

  'latency-percentiles': {
    title: 'Calidad de internet — latencia y pérdida',
    what: 'Latencia, jitter y % de pérdida de paquetes hacia destinos externos confiables (1.1.1.1, 8.8.8.8) medidos desde el servidor del dashboard.',
    dataSource: 'Ping ICMP activo cada 30s con 10 paquetes por ronda hacia cada destino configurado en QUALITY_CHECK_TARGETS.',
    formula: 'Por ventana: p50 = mediana, p90 = percentil 90, p99 = percentil 99 de los RTTs. Jitter = desviación estándar. Loss = paquetes_perdidos / paquetes_enviados × 100.',
    interpretation: [
      'p50 ≈ experiencia "normal". Sube cuando hay congestión sostenida.',
      'p99 alto pero p50 normal = pérdida intermitente. Síntoma típico de VoIP entrecortado.',
      'Jitter > 30ms = problemas para tiempo real (Zoom, llamadas).',
      'Loss > 1% sostenido = enlace degradado o ISP con problemas.',
      'Si la PC del dashboard sale por la WAN principal, esto refleja la calidad real que ven los usuarios.',
    ],
    caveats: [
      'Mide solo a 2 IPs. Si el problema es específico a un destino, no aparece aquí.',
      'Si tu PC tiene QoS o cache local activo, los pings pueden ser anormalmente buenos.',
    ],
  },

  // ============== WAN ==============
  'wan-availability': {
    title: 'Caídas y disponibilidad de las WAN',
    what: 'Dos vistas complementarias del mismo dato: timeline Gantt de cada caída en el rango corto (24h / 7d / 30d) y mapa calendar de disponibilidad % por día (90 días).',
    dataSource: 'Tabla wan_status_changes, alimentada por los eventos syslog Connectivity Check del USG ("interface ALIVE/DEAD" del ping a 8.8.8.8 / 1.1.1.1). Ambos paneles usan exactamente la misma fuente, por lo que un día con caídas en el Gantt se ve también en el calendar con el mismo % de uptime.',
    formula: 'Gantt: pares (start_ts, end_ts) reconstruidos cada vez que new_status pasa 0→1. Calendar: para cada día, se intersectan los spans DOWN con el rango 00:00-23:59 (o 00:00→ahora si es hoy) y uptime% = (1 - down_s / day_s) × 100. El día actual se mide solo sobre las horas ya transcurridas.',
    interpretation: [
      'Gantt: cada barra roja es un periodo DOWN. Mientras más anchas y frecuentes, más inestable el ISP.',
      'Calendar: verde = ≥99.9%, ámbar = 99-99.9%, rojo < 99%. Ayuda a identificar patrones (caídas siempre los lunes, etc.).',
      'Si los 3 WAN caen al mismo tiempo es señal de problema del firewall o del Connectivity Check, no de los ISPs.',
      'Usar para SLA reports: el calendar muestra exactamente cuántos minutos down hubo cada día.',
    ],
    caveats: [
      'Mide alcance a internet vía Connectivity Check, no link físico. Si el cable está conectado pero el ISP no enruta, se cuenta como DOWN (que es lo que importa al negocio).',
      'Si el firewall queda incomunicado del dashboard (gap SNMP largo) pero el USG sí siguió emitiendo Connectivity Check, los datos se recuperan al volver la conexión.',
      'Si solo hay un destino de Connectivity Check (ej. solo 8.8.8.8) y Google tiene un blip, se cuenta como caída de ISP — usar 2 destinos (1.1.1.1 + 8.8.8.8) para minimizar falsos positivos.',
    ],
  },

  'wan-saturation-heatmap': {
    title: 'Patrón de saturación hora × día',
    what: 'Heatmap de bps promedio por cada hora del día y día de la semana, durante el rango seleccionado (1h / 6h / 24h / 7d / 15d / 30d). Las 3 WAN comparten la misma escala de color para poder compararlas directamente.',
    dataSource: 'Tabla wan_metrics, agrupada por strftime("%w", ts) (día semana 0=Dom) y strftime("%H", ts) (hora) en hora local.',
    formula: 'AVG(bps_in + bps_out) GROUP BY weekday, hour. Se calcula un max global entre las 3 WAN; el visualMap usa ese max compartido para que el mismo color signifique los mismos bps en todos los charts.',
    interpretation: [
      'Identifica ventanas de saturación recurrente: "Lunes 9am siempre rojo" = backup masivo, OS updates, etc.',
      'Lunes-viernes 9-18h con consumo alto = horario laboral normal.',
      'Picos nocturnos = backups programados o malware extrayendo data fuera de horario.',
      'Comparar las 3 WAN: si una está saturada y otras dos relajadas, hay margen para balancear/failover.',
    ],
    caveats: [
      'Rangos cortos (1h/6h) sólo poblarán pocas celdas — usar 7d+ para detectar patrones semanales.',
      'Promedios pueden esconder picos cortos pero intensos.',
    ],
  },

  'wan-consumption-heatmap': {
    title: 'Consumo total hora × día por WAN',
    what: 'Heatmap del volumen total (bytes) consumido en cada hora-del-día × día-de-la-semana, agregado sobre el rango seleccionado. Igual al de saturación pero midiendo volumen acumulado en lugar de tasa promedio.',
    dataSource: 'Tabla wan_metrics. SUM(bps_in + bps_out) por (dow, hour), convertido a bytes mediante el intervalo de polling (POLL_INTERVAL_SECONDS / 8). Escala compartida entre las 3 WAN.',
    formula: 'bytes_celda = SUM(bps_in + bps_out) × poll_interval_seconds / 8. La barra "Total por WAN" muestra la suma de todas las celdas de cada WAN y su porcentaje del total agregado.',
    interpretation: [
      'Responde "qué WAN consumió más" y "en qué momento del día/semana" en un solo gráfico.',
      'Diferencia con el de saturación: bps_avg dice cómo de "lleno" estuvo el enlace; bytes_total dice cuánto se transfirió. Una WAN saturada por 5 minutos vale menos que una a la mitad pero todo el día.',
      'Top consumidor en rojo te dice cuál ISP carga más tu factura (relevante si pagas por GB) o cuál enlace deberías upgradar primero.',
    ],
    caveats: [
      'La conversión bytes ≈ bps × poll_interval / 8 asume que la tasa instantánea registrada representa el promedio del intervalo entre polls; ráfagas dentro del intervalo pueden subestimar.',
      'Rangos cortos (1h, 6h) son útiles para "qué pasa AHORA"; 7d+ para detectar patrones.',
    ],
  },

  'anomaly-bands': {
    title: 'Detección de anomalías — bandas históricas',
    what: 'Línea de tráfico actual sobrepuesta con el rango histórico (p5–p95) de las últimas 4 semanas a la misma (hora, día de semana).',
    dataSource: 'wan_metrics. Se separan dos series: la actual (últimas 24h) y la "histórica" (últimas 4 semanas).',
    formula: 'Para cada bucket de tiempo actual, se busca su (weekday, hour) y se calculan p5/p50/p95 de TODOS los samples históricos con ese mismo (weekday, hour). La banda cyan = p5 a p95. Línea punteada = mediana.',
    interpretation: [
      'Línea roja DENTRO de la banda = comportamiento normal para esa hora/día.',
      'Línea roja ARRIBA del p95 = pico anormal — más tráfico del esperado. Investigar.',
      'Línea roja DEBAJO del p5 = anormalmente bajo — puede indicar que algo no está conectando.',
      'Banda muy ancha = mucha variabilidad histórica; banda angosta = patrón muy predecible.',
    ],
    caveats: [
      'Mínimo 1 semana de historia para que las bandas tengan sentido. Ideal: 4+ semanas.',
      'Días feriados aparecerán como "anómalos" aunque sean explicables.',
      'No detecta cambios graduales sostenidos (esos sí entran al baseline).',
    ],
  },

  'outage-investigation': {
    title: 'Investigación forense de caídas',
    what: 'Panel diagnóstico que reconstruye todo lo que se observó en una ventana de tiempo: cambios de estado WAN, samples de ping, gaps de SNMP, eventos Connectivity Check del USG. Detecta automáticamente periodos sospechosos que pudieron haber sido caídas que el sistema de alertas no capturó.',
    dataSource: 'Cruce de wan_status_changes (SNMP poller + syslog), internet_quality (ping prober local), system_metrics (gaps = poller no respondió), events filtrados a category="Connectivity Check" y "monitor".',
    formula: 'Issues detectados: SNMP gap si >90s entre samples. Quality gap si >120s sin ping a un target. Pérdida sostenida si ≥3 samples consecutivos con loss ≥50%. Flapping si ≥3 cambios up/down en 10 min.',
    interpretation: [
      'Stats cards: # críticos = problemas graves, # warnings = sospechosos, # cambios WAN, # samples SNMP totales.',
      'Chart: latencia (sólida) + loss (punteada) por destino. Bandas rojas = WAN DOWN según SNMP/syslog.',
      'Lista de problemas: cada item es una "evidencia" de algo raro. Si reportaste caída pero la lista está vacía, ocurrió en una ventana donde tampoco nuestros sensores la captaron.',
      'Eventos Connectivity Check: feed directo del syslog del USG. Si hay DEAD/ALIVE, esa es la versión "oficial" del firewall.',
    ],
    caveats: [
      'Si tu PC pierde red, los pings fallan PERO la métrica también deja de actualizarse. Esto se reporta como "gap de ping" — útil pero ambiguo (fue red o fue prober muerto?).',
      'Caídas <30s tipicamente NO aparecen porque ningún poller corre tan rápido.',
      'Si Connectivity Check no está activo en el USG, esta sección no muestra eventos DEAD/ALIVE oficiales.',
    ],
  },

  'hardware': {
    title: 'Hardware del firewall — temperatura, fans, PSU',
    what: 'Lectura de sensores físicos del USG: temperatura interna, RPM de ventiladores, status de fuentes de poder.',
    dataSource: 'SNMP polling cada 5 min a OIDs propietarios Zyxel (rama 1.3.6.1.4.1.890.1.15.*). Best-effort: si el firmware no expone estos OIDs, la sección queda vacía con un mensaje claro.',
    formula: 'Lectura directa de los OIDs hardware sensors. Sin transformación. Unidades: temp °C, fan rpm, psu W.',
    interpretation: [
      'Temperatura > 70°C sostenida = revisar enfriamiento del rack, fans bloqueados, ambiente caliente.',
      'Fans a 0 rpm con temp alta = ventilador muerto, riesgo de thermal throttling.',
      'PSU reportando watts anormales = fuente fallando, considerar swap.',
    ],
    caveats: [
      'El USG Flex 700H en algunos firmwares no expone estos OIDs. En ese caso la sección muestra "no disponible".',
      'No es un sustituto del monitoreo físico — si nadie va al rack, no sabes que el LED está rojo.',
    ],
  },

  // ============== LAN ==============
  'lan-ports': {
    title: 'Puertos LAN / SFP',
    what: 'Estado en tiempo real de cada interfaz LAN/DMZ del firewall: link, velocidad, bps actual, errores, utilización %.',
    dataSource: 'SNMP polling cada 30s a ifTable + ifXTable para cada puerto en LAN_INTERFACES (.env).',
    formula: 'bps calculado como en WAN. Utilización = max(bps_in, bps_out) / (link_speed × 1_000_000) × 100. El semáforo: verde < 40%, ámbar 40-75%, rojo > 75% o errores > 5/s.',
    interpretation: [
      'Card roja con pulse = puerto DOWN, cable desconectado o switch del otro lado caído.',
      'Card ámbar = saturación cerca del cap o errores elevados.',
      'Card verde = todo bien.',
      'Link speed: si negocia 100M cuando debería ser 1G = cable malo, mismatch duplex.',
      'Click en una card → drill-down (próximamente).',
    ],
    caveats: [
      'Wi-Fi (P13-WIFI, P12-WIFI-1) son interfaces lógicas, no físicas — el link speed es el max del SSID, no de un cable.',
    ],
  },

  'lan-errors': {
    title: 'Mapa de errores por puerto LAN',
    what: 'Heatmap de errores/segundo (in + out) por cada puerto LAN, agregados en buckets de tiempo.',
    dataSource: 'SNMP ifInErrors (1.3.6.1.2.1.2.2.1.14) e ifOutErrors (1.3.6.1.2.1.2.2.1.20). Convertidos a tasa por segundo por delta_counter / Δt.',
    formula: 'Por bucket de 10 min: AVG(errors_in) + AVG(errors_out). Color escalado al máximo del periodo.',
    interpretation: [
      'errors_in: paquetes recibidos con CRC mal, runt (<64B), giant (>MTU), alignment. Indica problema físico — cable, EM, duplex mismatch.',
      'errors_out: paquetes que no se pudieron transmitir. Causa típica: collision (half-duplex), buffer overflow.',
      'Wi-Fi tiene base normal mayor por retransmisiones aéreas — picos sostenidos son lo preocupante.',
      'Cableado: cualquier error sostenido = revisar patch cord y conectores.',
      'Click en una celda → modal con detalle (in vs out separados, time series, contexto).',
    ],
    caveats: [
      'SNMP solo da el TOTAL, no el TIPO específico (CRC vs collision vs alignment). Para desglose detallado se requiere EtherLike MIB que algunos firmwares no exponen.',
    ],
  },

  'devices-arp': {
    title: 'Dispositivos detectados (ARP del firewall)',
    what: 'Lista de IPs/MACs visibles desde el USG, descubiertos por la tabla ARP (ipNetToMediaTable). Con enriquecimiento opcional via SNMP probe y matcheo con DHCP reservations.',
    dataSource: 'SNMP walk a ipNetToMediaPhysAddress (1.3.6.1.2.1.4.22.1.2) cada 30 min. Vendor identificado por OUI del MAC. Si DEVICE_SNMP_PROBE_ENABLED, se intenta SNMP a cada device con community "public" para sacar sysName/sysDescr.',
    formula: 'Lista cruda del ARP. Vendor = OUI lookup (primeros 6 hex del MAC en tabla minimal). Hostname = preferencia: DHCP reservation > sysName SNMP > IP.',
    interpretation: [
      'Iconos por tipo: Network (switch), Wifi (AP), Phone (teléfono), Monitor (host genérico).',
      'Cpu verde junto al icon = el device respondió a SNMP probe.',
      'Click en una card → modal con tráfico histórico del dispositivo, top destinos, eventos.',
      'Búsqueda funciona por IP, MAC, hostname o vendor.',
      'Re-scan: fuerza un descubrimiento inmediato sin esperar 30 min.',
    ],
    caveats: [
      'Solo aparecen devices que HAN HABLADO recientemente (entradas vivas en ARP del USG).',
      'OUI table es minimal (~50 vendors). Devices con MACs raros aparecerán como "Unknown".',
      'SNMP probe usa community "public" — muchos devices la tienen deshabilitada, esos quedan sin CPU/mem.',
    ],
  },

  'devices-consumption': {
    title: 'Consumo por dispositivo (inventario)',
    what: 'Catálogo curado de equipos de infraestructura (Access Points, impresoras, servidores, switches y XVRs) con su consumo de bajada (↓ descarga) y subida (↑ subida) en la ventana elegida.',
    dataSource: 'Inventario estático mantenido en backend/app/devices/inventory.py, cruzado por IP con flow_aggregates (poblada por syslog Traffic Log y/o NetFlow del USG).',
    formula: 'Por cada equipo del inventario: bytes_in = SUM(bytes WHERE dst_ip = ip), bytes_out = SUM(bytes WHERE src_ip = ip), dentro de la ventana (1h / 24h / 7d). Las cards se ordenan por consumo total descendente.',
    interpretation: [
      'Filtra por tipo (Access Point, Impresora, Servidor, Switch, XVR) con los chips de arriba.',
      'Selector de ventana 1h / 24h / 7d ajusta el periodo del consumo mostrado.',
      '↓ = bytes recibidos por el equipo (descarga). ↑ = bytes enviados por el equipo (subida).',
      '"Sin tráfico" = el firewall no registró flujos de esa IP en la ventana (equipo callado o syslog/NetFlow sin datos).',
      'Click en una card → modal con histórico de tráfico, top destinos y eventos del equipo.',
    ],
    caveats: [
      'El consumo depende de que el USG esté enviando Traffic Log (syslog) o NetFlow. Si no hay datos, todo aparece como "Sin tráfico".',
      'Para editar el inventario (agregar/quitar equipos) se modifica la lista en inventory.py.',
      'El cruce es por IP: si un equipo cambia de IP, el consumo no se atribuye hasta actualizar el inventario.',
    ],
  },

  'devices-inventory': {
    title: 'Inventario de dispositivos',
    what: 'Dos vistas: donut con distribución por vendor (OUI) y lista de dispositivos nuevos detectados en los últimos N días.',
    dataSource: 'Tabla devices (poblada por discovery ARP). Vendor desde OUI lookup. first_seen = primera vez que el ARP lo registró.',
    formula: 'Donut: COUNT(*) GROUP BY vendor, ordenado descendente. Top 12 + agregado "Otros". Nuevos: WHERE first_seen >= ahora − N días.',
    interpretation: [
      'Donut: ayuda a saber composición de la red. Mucho Apple = ambiente BYOD. Mucho Cisco/Aruba = infra empresarial.',
      'Lista de nuevos: detectar dispositivos no autorizados. Si aparece una IP "nueva" que no reconoces = posible breach o invitado.',
      'Filtros 1/7/30 días en la lista de nuevos.',
    ],
    caveats: [
      'first_seen depende de cuándo arrancaste el dashboard. Devices que ya estaban conectados desde antes se marcan como "nuevos" en el primer scan.',
      'Donut ignora ~50% de la red si los MACs no están en tu tabla OUI (aparecen como "Unknown").',
    ],
  },

  // ============== VPN ==============
  'vpn-overview': {
    title: 'VPN — Site-to-Site y sesiones cliente',
    what: 'Resumen de todos los túneles IPSec site-to-site detectados y de las sesiones de clientes VPN (L2TP / SSL / IKEv2).',
    dataSource: 'Parseo del syslog cat="IPSec VPN" para extraer el nombre del túnel (regex VPN-XXX), peer IP, y estado. Para clientes: cat="L2TP" / "SSL VPN" / "User" con keywords de VPN.',
    formula: 'Túnel UP: cualquier DPD/IKE event en últimos 5 min. STALE: UP pero sin actividad en > 5 min. DOWN: evento explícito de "deleted/down/disconnect". Cliente sesión = ventana entre login y logout/disconnect.',
    interpretation: [
      'Cards de túnel: verde = UP saludable, ámbar = STALE (sospechoso), rojo = DOWN.',
      'DPD count: cuántos heartbeats han pasado. Rekeys: cuántas veces se re-negoció clave (alto = enlace inestable).',
      'Tabla de clientes: usuario + IP origen + duración. Útil para auditar conexiones remotas.',
    ],
    caveats: [
      'Solo aparecen túneles que han emitido al menos UN evento syslog desde que el dashboard arrancó. Túneles nunca configurados o silenciosos no se ven.',
      'El nombre del túnel se extrae del mensaje syslog — si tu USG genera mensajes sin nombre, no se identifican.',
    ],
  },

  'vpn-uptime': {
    title: 'Uptime por túnel VPN',
    what: 'Gauges mostrando % de tiempo que cada túnel estuvo activo en la ventana elegida (24h / 7d / 30d).',
    dataSource: 'Eventos cat="IPSec VPN" del túnel.',
    formula: 'Se divide la ventana en buckets de 5 min. Bucket "alive" si tuvo ≥1 evento del túnel (DPD, IKE, etc.). uptime% = alive_buckets / total_buckets × 100.',
    interpretation: [
      'Verde ≥ 95%: túnel sano, conexión confiable a la sucursal.',
      'Ámbar 80-95%: hay caídas periódicas, vale la pena revisar el ISP de la sucursal.',
      'Rojo < 80%: túnel muy inestable. Investigar urgente o cambiar enlace.',
      'Ranking: los gauges se ordenan por uptime descendente — los problemáticos quedan al final.',
    ],
    caveats: [
      'Si el firewall no emite eventos del túnel (por config baja de logging), aparecerá como con uptime bajo aunque el túnel esté UP. Verificar log settings en USG.',
      'Buckets de 5min = granularidad limitada. Caídas de < 5min pueden no contar.',
    ],
  },

  'vpn-daily-heatmap': {
    title: 'Consumo diario por VPN',
    what: 'Matriz VPN × día donde cada celda muestra el total de bytes (in + out) que pasó por ese túnel ese día. El eje Y va ordenado de mayor a menor consumo total en el rango.',
    dataSource: 'flow_aggregates filtrado por la subred remota de cada túnel (VPN_REMOTE_SUBNETS), agrupado por día UTC. Cada túnel × día es una celda; los días sin tráfico aparecen en frío.',
    formula: 'Para cada (tunnel, day): SUM(bytes WHERE src_ip LIKE remote_prefix OR dst_ip LIKE remote_prefix AND day_start <= ts_bucket < day_end). El % de la etiqueta del eje Y es bytes_tunnel / bytes_totales_del_rango.',
    interpretation: [
      'El "top consumidor" arriba a la derecha responde directamente "quién consumió más" en el rango.',
      'Una franja oscura horizontal = ese túnel está prácticamente inactivo (¿se quedó UP sin tráfico real?).',
      'Una columna entera en color = día con uso anómalo en toda la red (respaldos masivos, evento, ataque coordinado).',
      'Picos aislados en una sola sucursal = revisar si fue legítimo (sync de fin de mes, backup) o algo a investigar.',
    ],
    caveats: [
      'Solo aparecen túneles con CIDR remoto declarado en VPN_REMOTE_SUBNETS. Los que falten se omiten silenciosamente.',
      'Los días se cortan a medianoche del servidor — no es necesariamente la zona horaria de la sucursal remota.',
      'El consumo no distingue tipo de tráfico; un día caliente puede ser uso legítimo o backup, hay que correlacionar con el contexto.',
    ],
  },

  'vpn-usage-heatmap': {
    title: 'Uso semanal por hora — VPN',
    what: 'Matriz hora del día × día de la semana donde el color indica el volumen total de bytes que pasó por el túnel seleccionado en cada celda, agregado en el rango elegido (7d / 30d / 90d).',
    dataSource: 'flow_aggregates filtrado por la subred remota del túnel (VPN_REMOTE_SUBNETS), agrupado por strftime weekday/hour en hora local.',
    formula: 'Para cada (dow, hour): SUM(bytes WHERE src_ip LIKE remote_prefix OR dst_ip LIKE remote_prefix). Colores escalan del fondo al rojo según el máximo observado en el rango.',
    interpretation: [
      'Identifica el patrón normal de uso de cada sucursal: ¿picos en horario de oficina? ¿uso 24×7? ¿domingos muertos?',
      'Útil para planear ventanas de mantenimiento (celdas oscuras = bajo uso).',
      'Anomalías visuales (un cuadro caliente fuera del patrón) pueden indicar respaldos no programados, malware, o cambio de comportamiento en la sucursal.',
    ],
    caveats: [
      'Requiere subnet remota configurada en VPN_REMOTE_SUBNETS para el túnel.',
      'Rango 7d puede tener celdas vacías si no hubo tráfico ese día/hora; mejor 30d para detectar el patrón.',
      'Hora local del servidor del dashboard (no del peer remoto).',
    ],
  },

  'vpn-traffic': {
    title: 'Tráfico por túnel VPN',
    what: 'Bytes intercambiados con la subred remota de cada túnel site-to-site en el rango elegido, separados in (tráfico que vino desde la sucursal) y out (tráfico que se envió hacia la sucursal).',
    dataSource: 'Mapa VPN_REMOTE_SUBNETS (tunnel_name → CIDR remoto en .env) cruzado con flow_aggregates (poblada por syslog Traffic Log).',
    formula: 'Para cada túnel con CIDR remoto configurado: SUM(bytes WHERE src_ip LIKE remote_prefix) = bytes_in. SUM(bytes WHERE dst_ip LIKE remote_prefix) = bytes_out. Soporta /24, /16 y /8 con LIKE prefix en SQL.',
    interpretation: [
      'Identifica qué sucursales consumen más ancho de banda site-to-site.',
      'Útil para planear upgrades de enlace o detectar uso anómalo por sucursal.',
      'Sucursales con 0 bytes pero estado UP = túnel establecido pero sin tráfico real (¿config de ruteo mala?).',
    ],
    caveats: [
      'Requiere que cada túnel tenga su CIDR remoto declarado en VPN_REMOTE_SUBNETS. Túneles sin mapear se listan al final con un aviso "sin subnet configurada".',
      'Solo cuenta tráfico que el firewall vio pasar como Traffic Log. Tráfico encapsulado dentro del túnel no se desglosa.',
      'No correlaciona por peer_ip (IP WAN pública del otro lado): flow_aggregates almacena IPs internas, no las del peer público.',
    ],
  },

  'branches-map': {
    title: 'Mapa geográfico de sucursales',
    what: 'Mapa mundial centrado en México mostrando la ubicación geográfica de cada peer IP de los túneles site-to-site.',
    dataSource: 'Peer IPs de vpn_tunnels enriquecidos con GeoIP (ip-api.com, free tier, cache 7 días).',
    formula: 'Lookup lat/lon del peer_ip → punto en el mapa. Color por health del túnel (verde/ámbar/rojo). Efecto "ripple" para resaltar puntos activos.',
    interpretation: [
      'Visualización rápida de la red privada: dónde están geográficamente todas las sucursales.',
      'Si una sucursal en el mapa cambia de verde a rojo = ese enlace se cayó.',
      'Hover en cada punto: nombre del túnel, peer IP, ciudad, ISP.',
    ],
    caveats: [
      'GeoIP resuelve la ubicación del ISP del peer, no la oficina exacta. Una sucursal en Querétaro puede aparecer en CDMX si el ISP centraliza ahí.',
      'Si el peer IP es CDN o cloud-NAT (raro pero posible), la ubicación será del datacenter del provider.',
    ],
  },

  // ============== TRAFFIC ==============
  'top-hosts-bytes': {
    title: 'Top consumo por host — bytes',
    what: '4 paneles con los top 20 IPs por bytes consumidos: hosts LAN por bajada, hosts LAN por subida, IPs externas que más enviaron, IPs externas que más recibieron.',
    dataSource: 'Tabla flow_aggregates, alimentada por: (1) syslog Traffic Log del USG (parsing de sent= y rcvd=), y (2) NetFlow v9 si NETFLOW_ENABLED y el firmware lo soporta.',
    formula: 'Clasificación por RFC1918: si src_ip es privada (10/8, 172.16/12, 192.168/16) → LAN host. Si dst_ip es privada → external talking TO us. Luego SUM(bytes) GROUP BY ip, ordenado descendente, top 20.',
    interpretation: [
      'Hosts LAN por bajada: identifica quién está descargando más. Útil para detectar updates masivos, backups, streaming, o malware exfil.',
      'IPs externas por download (de ellas): destinos a los que tus hosts envían más. Útil para detectar exfiltración.',
      'Si el mismo host aparece en top de subida Y bajada con volúmenes grandes = probable backup o sync masivo.',
      'Selector de rango: 5m / 1h / 6h / 24h / 7d.',
    ],
    caveats: [
      'Si NetFlow no está activo en el USG, los datos vienen solo del syslog Traffic Log que requiere SYSLOG_MIN_SEVERITY=6 para incluir info logs.',
      'Tráfico cifrado pasa por aquí pero solo se ve el destino — no qué hay adentro.',
    ],
  },

  'top-talkers-events': {
    title: 'Top talkers — desde eventos syslog',
    what: 'Top IPs origen, IPs destino y puertos destino vistos en eventos del syslog (drops, policy matches, etc.).',
    dataSource: 'Tabla events (parseado de syslog cat="Security Policy Control" principalmente).',
    formula: 'COUNT(*) GROUP BY src_ip / dst_ip / dst_port. Top 10 cada uno.',
    interpretation: [
      'NO mide bytes — mide CUENTAS de eventos. Una IP haciendo 1000 intentos de conexión a un puerto cerrado aparece arriba aunque no haya transferido datos.',
      'Top src_ip: hosts internos "chismosos" que generan muchos drops (típico: device intentando llegar a un servicio que no existe).',
      'Top dst_port: puertos más solicitados, útil para entender qué servicios se intenta usar.',
    ],
    caveats: [
      'No es lo mismo que "Top consumo por host" (esa SÍ es bytes). Aquí cuenta intentos, no volumen.',
    ],
  },

  'geo-external': {
    title: 'Geo-map mundial — tráfico externo',
    what: 'Mapa mundial con burbujas representando IPs externas que intercambiaron tráfico con tu red, tamaño proporcional a bytes.',
    dataSource: 'flow_aggregates filtrado a IPs externas + GeoIP lookup (ip-api.com).',
    formula: 'Para cada IP externa en el rango: SUM(bytes). Lookup lat/lon. Tamaño de burbuja = bytes / max_bytes × 40 px.',
    interpretation: [
      'Concentración esperada en US (CDNs, cloud), MX (servicios locales), CL/BR (LATAM).',
      'Burbujas grandes en regiones inesperadas (RU/CN/IR) = revisar. Posible exfil, malware, o tráfico legítimo no documentado.',
      'Hover: IP, país, ciudad, ISP, bytes exactos.',
    ],
    caveats: [
      'Mucho tráfico aparece en US porque Cloudflare/Amazon/Google centralizan PoPs ahí, aunque el contenido sea servido desde otros lados.',
      'GeoIP free tier (45 req/min) — cache local 7d compensa para IPs recurrentes. IPs nuevas pueden tardar minutos en aparecer.',
    ],
  },

  // ============== SECURITY ==============
  'attacks-classified': {
    title: 'Intentos desde Internet — clasificación inteligente',
    what: 'IPs externas que generaron drops contra tu WAN pública, clasificadas en 4 categorías (ataque / scan / servicio / ruido) según el patrón de puertos.',
    dataSource: 'events table donde category="Security Policy Control" y action="Drop" y src_ip externa. Enriquecido con GeoIP (país + ISP).',
    formula: 'Por cada src_ip: COUNT(*), distinct_ports, top 5 puertos. Clasificación: ATAQUE si ≥3 puertos distintos Y al menos uno conocido (22, 23, 80, 443, 3389, 445, 5060, 502, etc.). ESCANEO si ≥5 puertos mezclados. SERVICIO si pocos puertos pero conocido. RUIDO en otro caso. Score = peso(categoría) × 1000 + distinct_ports × 10 + min(attempts, 100).',
    interpretation: [
      'ATAQUE 🔴: enfoque a servicios conocidos. Top prioridad para bloquear.',
      'ESCANEO 🟡: escaneo amplio aunque no apunte a servicios. Bulletproof hosting típico.',
      'SERVICIO 🟣: drops repetidos a puerto conocido — brute force candidate.',
      'RUIDO ⚪: pocos puertos en rango efímero — probable tráfico VoIP de retorno, NAT expirado, no es ataque.',
      'Botón "Exportar a Excel": genera blocklist lista para aplicar en USG (4 hojas con sub-redes /24 agrupadas).',
    ],
    caveats: [
      'Censys (scanner legítimo) aparece como "ataque" porque su patrón es indistinguible.',
      'ISPs residenciales (Telmex, Telcel) suelen ser falsos positivos — su tráfico legítimo con sesiones expiradas se ve como "noise".',
      'La clasificación se basa en heurísticas — puede equivocarse. Verifica antes de bloquear masivamente.',
    ],
  },

  'events-severity': {
    title: 'Eventos por severidad',
    what: 'Conteo de eventos del firewall agrupados por bucket de tiempo, apilados por nivel de severidad (alert, warning, notice, info, etc.).',
    dataSource: 'Tabla events (syslog parseado del USG).',
    formula: 'COUNT(*) GROUP BY (ts / bucket_s) × bucket_s, priority. Bucket = 60s para rango 1h, 5min para 6h-24h, 1h para 7d.',
    interpretation: [
      'Picos súbitos en categoría alert/critical = incidente. Investigar timeline.',
      'Volumen sostenido alto en warning sin trigger claro = configuración syslog demasiado verbosa.',
      'Cero eventos durante muchas horas = ¿syslog dejó de llegar? verificar conexión USG → dashboard.',
    ],
    caveats: [
      'El conteo depende de qué categorías habilitas en el USG (Log Category Setting). Si activaste Debug, los conteos explotan.',
    ],
  },

  'events-hour-day': {
    title: 'Patrón de eventos hora × día',
    what: 'Heatmap mostrando cantidad de eventos por (hora del día, día de la semana) durante el periodo elegido.',
    dataSource: 'Tabla events.',
    formula: 'COUNT(*) GROUP BY weekday, hour (en hora local).',
    interpretation: [
      'Identifica patrones temporales: "siempre hay drops a las 3am los martes" → tarea scheduled algo.',
      'Ataques sostenidos a horas raras (madrugada) tienden a ser bots automáticos.',
      'Eventos en horario laboral (9-18 lunes-viernes) más relacionados con actividad de usuarios.',
    ],
    caveats: [
      'Requiere 7+ días de historia para mostrar patrón confiable.',
      'Una semana atípica (vacaciones, mantenimiento) puede sesgar el patrón.',
    ],
  },

  'events-feed': {
    title: 'Eventos recientes',
    what: 'Feed en vivo de los últimos eventos parseados del syslog, con filtros por severidad y categoría.',
    dataSource: 'Tabla events, los más recientes primero.',
    formula: 'SELECT … FROM events ORDER BY ts DESC LIMIT n.',
    interpretation: [
      'Útil para investigación inmediata: "¿qué pasó hace 5 min?".',
      'Filtros: alert / warning / notice / info para narrowing rápido.',
      'Cada fila tiene src/dst/port/acción — clic para detalle (próximamente).',
    ],
    caveats: [
      'No es histórico completo — solo lo persistido en events (sujeto a retención RETENTION_DAYS).',
    ],
  },
}

export function getHelp(key: string): ChartHelp | undefined {
  return HELP_REGISTRY[key]
}
