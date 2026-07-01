# Gráficas adicionales (recomendadas, no deben faltar)

Complemento a [DASHBOARD.md](DASHBOARD.md). Estas visualizaciones aportan dimensiones que las gráficas básicas de línea/barra no cubren y son las que típicamente revelan problemas antes de que escalen.

Cada sección incluye: **qué problema resuelve**, **dato/origen**, y **tipo de visualización ECharts**.

---

## 1. Sparklines dentro de las tarjetas KPI

**Qué resuelve:** ver de un vistazo si el valor actual es típico o anómalo, sin tener que mirar la gráfica grande.

- Mini línea de últimos 60 min embebida en cada tarjeta de WAN, CPU, MEM, Sesiones.
- Eje invisible, solo la curva.
- Color por estado (verde si normal, ámbar si en alerta).

**ECharts:** `series.type: 'line'` sin ejes, sin tooltip, `smooth: true`, `lineStyle.width: 2`.

---

## 2. Calendar heatmap de disponibilidad (90 días)

**Qué resuelve:** identificar patrones de caídas (¿siempre los lunes? ¿solo en horario laboral?). Equivalente al "contribution graph" de GitHub.

- Una grilla por WAN.
- Cada celda = 1 día. Color por % de disponibilidad (verde 100% → amarillo 95% → rojo <90%).
- Tooltip muestra duración de downtime y número de eventos de failover ese día.

**ECharts:** `calendar` + `series.type: 'heatmap'` con `coordinateSystem: 'calendar'`.

---

## 3. Heatmap hora × día de la semana (saturación)

**Qué resuelve:** identificar ventanas predecibles de saturación. "Cada lunes 9–10am la WAN1 va al 95%". Permite planear backups, OS updates, capacidad.

- Eje X: hora 0–23. Eje Y: día de la semana (Lun–Dom).
- Color: utilization% promedio en esa hora.
- Una variante por cada métrica clave: `utilization`, `sessions_total`, `events_per_min`.

**ECharts:** `series.type: 'heatmap'`, `visualMap` con paleta Agiotech (`chartGreen → chartAmber → chartRed`).

---

## 4. Percentiles de latencia (p50 / p90 / p99) — no solo promedio

**Qué resuelve:** el promedio miente. Un enlace con 95% de pings a 10ms y 5% a 800ms se ve "normal" en promedio (~50ms) pero la experiencia es pésima. Los percentiles exponen esto.

- Línea p50 (mediana) + banda p90 + banda p99.
- Comparativa entre las 3 WAN.

**ECharts:** `series.type: 'line'` con `areaStyle` para la banda, dos series stacked para p99-p90 y p90-p50.

---

## 5. Sankey: flujo VLAN → WAN

**Qué resuelve:** entender de un vistazo qué subred manda tráfico por qué WAN. Crítico cuando hay políticas de routing tipo "VLAN20 sale por WAN2".

- Nodos izquierda: VLANs / subnets internas.
- Nodos derecha: WANs.
- Ancho del flujo = bytes en la ventana.

**ECharts:** `series.type: 'sankey'`. Requiere NetFlow para datos.

---

## 6. Treemap de aplicaciones / puertos por bytes

**Qué resuelve:** "¿qué se está comiendo el ancho de banda ahora?". Más legible que una tabla.

- Cada bloque = una app/puerto. Área proporcional a bytes consumidos.
- Click → drill-down a hosts que la usan.

**ECharts:** `series.type: 'treemap'`. Requiere NetFlow.

---

## 7. Geo-map de IPs externas (origen y destino)

**Qué resuelve:** detectar tráfico anómalo a regiones inesperadas (ej. tráfico saliente sustancial a Rusia o China cuando tu operación es solo MX). También útil para localizar ataques: una capa de marcadores en rojo donde caen los drops a la WAN.

- Mapa mundi con burbujas. Tamaño = bytes. Color = up/down/blocked.
- Filtros: últimas 1h / 24h.

**ECharts:** `geo` + `series.type: 'scatter'` con `coordinateSystem: 'geo'`. Requiere lookup IP→país (GeoIP2 lite o IP API local cache).

---

## 8. Stacked area: composición del tráfico por categoría

**Qué resuelve:** "¿qué es la mayoría del tráfico?". Aporta narrativa: "tu WAN está 60% HTTPS, 15% VPN, 10% DNS, 5% video, 10% otro".

- Eje Y stack: HTTPS, HTTP, DNS, SMTP, VoIP, VPN site-to-site, Otros.
- Eje X tiempo.
- Categorización por puerto + mapping editable.

**ECharts:** `series.type: 'line'` con `stack: 'traffic'` y `areaStyle`. Requiere NetFlow.

---

## 9. Histograma de duración de sesiones

**Qué resuelve:** un host con 1,000 sesiones cortas (escaneo, fuga de sockets) se ve igual en conteo total que 1,000 sesiones largas (sesiones de chat normal). El histograma de duración las distingue.

- Bins: <1s, 1–10s, 10s–1min, 1–10min, 10min–1h, >1h.
- Una serie por host top-10.

**ECharts:** `series.type: 'bar'` con buckets. Requiere acceso a tabla de sesiones del firewall (SNMP Zyxel proprietary).

---

## 10. TCP retransmits over time

**Qué resuelve:** el indicador más sensible de calidad de red. Sube antes de que aparezca packet loss visible.

- Línea por WAN.
- Umbrales horizontales (>0.5% advertencia, >2% crítico).

**ECharts:** línea con `markLine`. Requiere OID que exponga retransmits (depende del firmware del USG).

---

## 11. WAN comparison overlay

**Qué resuelve:** ver lado a lado las 3 WAN para detectar disparidad (una se cae mientras otras suben — failover normal; las 3 caen al mismo tiempo — algo más grave).

- 3 líneas superpuestas en la misma gráfica.
- Eje secundario opcional para mostrar % failover.

**ECharts:** múltiples `series.type: 'line'` en el mismo grid.

---

## 12. Time-series con bandas de anomalía (p5/p95 históricas)

**Qué resuelve:** detectar visualmente "esto no es normal" sin tener que recordar el baseline.

- Línea actual + banda gris translúcida con el rango p5–p95 de las últimas 4 semanas a la misma hora-día.
- Si la línea actual sale de la banda → anomalía.

**ECharts:** `series.type: 'line'` actual + dos series con `lineStyle.opacity: 0` y `areaStyle` para la banda.

---

## 13. Timeline (Gantt) de failovers WAN

**Qué resuelve:** "¿cuántos failovers tuvimos esta semana y cuándo?". Vista linear de incidentes.

- Eje X tiempo, una fila por WAN.
- Barras horizontales rojas durante periodos `DOWN`.
- Tooltip con duración y causa (si el evento syslog la trae).

**ECharts:** `series.type: 'custom'` con `renderItem` para Gantt, o `series.type: 'bar'` horizontal con `data` por intervalos.

---

## 14. Donut: distribución de estados TCP

**Qué resuelve:** una proporción alta de `TIME_WAIT` puede indicar que el firewall está manteniendo demasiadas sesiones cerradas (el problema que vimos en tu equipo).

- Estados: ESTABLISHED, TIME_WAIT, FIN_WAIT, SYN_SENT, CLOSE_WAIT.
- Snapshot actual + drill-down a host por estado.

**ECharts:** `series.type: 'pie'` con `radius: ['50%', '75%']` (donut).

---

## 15. Volumen de DNS queries por minuto (interno vs externo)

**Qué resuelve:** la mayoría de las "sesiones" en el log que analizamos eran DNS. Vigilarlo separadamente del resto del tráfico ayuda a detectar:
- DoH bypassing tu resolver interno (mucho UDP/53 directo a `8.8.8.8`).
- Hosts con DNS leak.
- Apps haciendo demasiadas resoluciones (mal cache).

- Líneas: queries a 192.168.1.10 (interno) vs queries a 8.8.8.8 / 1.1.1.1 (externos).

**ECharts:** `series.type: 'line'` apilado. Origen: NetFlow filtrando puerto 53.

---

## 16. Gauge: % uptime acumulado por túnel VPN (30d)

**Qué resuelve:** ranking visual de qué sucursales tienen más caídas. Una sucursal al 92% destaca contra el resto al 99%.

- Una gauge pequeña por túnel, agrupadas en grilla.

**ECharts:** `series.type: 'gauge'` con `progress.show: true`.

---

## 17. Bar race / top dinámico de hosts

**Qué resuelve:** ver cómo cambia el ranking de top talkers a lo largo del día. Útil en un monitor de TV en sala de operación.

- Animación: cada minuto se reordena el top 10.
- Versión estática: barras horizontales top-10 con `last 5 min` vs `previous 5 min` lado a lado.

**ECharts:** `series.type: 'bar'` con `realtimeSort: true`.

---

## 18. Sunburst: jerarquía Origen → Destino → Puerto

**Qué resuelve:** explorar el tráfico jerárquicamente. Anillos: interno (subnet) → externo (país/AS) → app/puerto.

- Click en un anillo zoom-in.
- Excelente para investigación post-incidente.

**ECharts:** `series.type: 'sunburst'`. Requiere NetFlow + GeoIP.

---

## 19. Throughput vs Utilization% (dos ejes)

**Qué resuelve:** distinguir "alto tráfico saludable" de "saturación".

- Eje Y izquierdo: Mbps actual.
- Eje Y derecho: % del link speed negociado.
- Si línea de utilization se acerca al 100% durante 5+ min → cuello.

**ECharts:** `yAxis: [{}, {}]`, dos `series` con `yAxisIndex` distinto.

---

## 20. Score de port-scan por IP externa

**Qué resuelve:** detectar escaneo agresivo desde una IP atacante en una sola visualización (el log analizado mostró IPs probando 23/3389/8494/9091 simultáneamente).

- Heurística: número de `dst_port` distintos vistos por la misma `src_ip` en ventana de 10 min.
- Top 10 IPs externas con score más alto.

**ECharts:** barras horizontales con color de severidad. Score se calcula en el backend.

---

## 21. Mapa de calor de errores por puerto LAN

**Qué resuelve:** identificar cables/SFPs degradándose. Un puerto con `errors_in` creciente sostenido casi siempre = cable malo o conector sucio.

- Eje X tiempo, eje Y puerto físico, color por errors/sec.

**ECharts:** `series.type: 'heatmap'`.

---

## 22. Bandwidth distribution por VPN tunnel

**Qué resuelve:** "¿qué sucursales consumen el ancho de banda site-to-site?". Útil para justificar upgrades o detectar uso anómalo de un site.

- Stacked bar diario, una banda por túnel.

**ECharts:** `series.type: 'bar'` con `stack: 'vpn'`.

---

## Prioridad para el MVP

Si hay que elegir, las **6 imprescindibles** son:

1. **Sparklines en KPI cards** — costo bajo, valor alto.
2. **Calendar heatmap de disponibilidad por WAN** — vista ejecutiva.
3. **Heatmap hora × día** — planeación.
4. **Latency p50/p90/p99** — calidad real.
5. **Timeline de failovers** — auditoría rápida.
6. **Stacked area de tráfico por categoría** — narrativa de uso.

Las que dependen de NetFlow (Sankey, Treemap, Sunburst, top hosts dinámico) se incorporan en la **Fase 8** del [ROADMAP.md](ROADMAP.md), una vez validado que el firmware del USG Flex 700H exporta NetFlow.

Las que dependen de GeoIP (geo-map, top países) requieren cargar una base GeoLite2 (descarga gratuita previo registro MaxMind) o consultar `ip-api.com` con caché local.
