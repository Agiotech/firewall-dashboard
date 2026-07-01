# Design System

Adaptación literal del **design system Agiotech** (`Dashboard CE / agiotech-dashboard-template`) al contexto de monitoreo de red.

> Regla: no se inventan colores ni tipografías nuevas. Si necesitas un tono intermedio, usa los existentes con alpha (ej. `chartAmber + '1a'` = 10% alpha).

---

## 1. Paleta de colores

### 1.1 Tokens — `frontend/src/theme/colors.ts` (copia literal)

```typescript
export const colors = {
  // Superficies
  surfaceBase:    '#f4fafe',
  surfaceBlock:   '#eef4f8',
  surfaceCard:    '#ffffff',
  surfaceHover:   '#e9eff3',
  surfaceSubtle:  '#e3e9ed',
  surfaceChip:    '#dde3e7',

  // Primarios
  primary:          '#006876',
  primaryDark:      '#004d57',
  primaryContainer: '#00b6cc',
  primaryFixed:     '#4bd8ee',

  // Texto
  textMain:      '#161c1f',
  textBody:      '#3c494c',
  textSecondary: '#4d5e85',
  textGhost:     '#bbc9cc',

  // Semánticos
  error:   '#ba1a1a',
  errorBg: '#ffdad6',

  // Dark mode
  darkBase:  '#2b3134',
  darkCard:  '#1e2528',
  darkBlock: '#252c2f',
  darkText:  '#ecf2f6',

  // Paleta gráficas oficial
  chartBlue:   '#006876',
  chartCyan:   '#00b6cc',
  chartIndigo: '#4d5e85',
  chartAqua:   '#4bd8ee',
  chartTeal:   '#26A69A',
  chartAmber:  '#FFA726',
  chartRed:    '#EF5350',
  chartGreen:  '#66BB6A',
  chartPurple: '#AB47BC',
  chartPink:   '#EC4899',
  chartOrange: '#FF7043',
}
```

### 1.2 Mapeo semántico para firewall

| Concepto | Color del token | Cuándo |
|---|---|---|
| WAN UP / healthy | `chartGreen` `#66BB6A` | oper_status=1 y util<70% y loss<1% |
| WAN saturada / lat alta | `chartAmber` `#FFA726` | util>70% o lat>50ms |
| WAN DOWN / loss alto | `chartRed` `#EF5350` | oper_status=0 o loss>5% |
| Métrica neutra / primaria | `chartBlue` `#006876` | CPU, sesiones, gráficos por defecto |
| Valor numérico destacado | `chartCyan` `#00b6cc` | totales, KPIs grandes |
| Categoría secundaria | `chartIndigo` `#4d5e85` | Memoria, info admin |
| Categoría extra (4ª+) | `chartTeal`, `chartPurple`, `chartOrange` | Series adicionales |
| Drop / bloqueo | `chartRed` con alpha | Eventos rechazados |
| VPN tunnel UP | `chartGreen` | Túnel activo |
| VPN tunnel DOWN | `chartRed` | Túnel caído |

---

## 2. Tailwind v4 — CSS-first

### 2.1 `frontend/src/index.css` (copia literal con anotación)

```css
@import "tailwindcss";

/* Dark mode: class strategy (.dark en <html>) */
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  /* Superficies */
  --color-surface-base:    #f4fafe;
  --color-surface-block:   #eef4f8;
  --color-surface-card:    #ffffff;
  --color-surface-hover:   #e9eff3;
  --color-surface-subtle:  #e3e9ed;

  /* Primarios */
  --color-primary:           #006876;
  --color-primary-dark:      #004d57;
  --color-primary-container: #00b6cc;
  --color-primary-fixed:     #4bd8ee;

  /* Texto */
  --color-text-main:      #161c1f;
  --color-text-body:      #3c494c;
  --color-text-secondary: #4d5e85;

  /* Dark */
  --color-dark-base:  #2b3134;
  --color-dark-card:  #1e2528;
  --color-dark-block: #252c2f;
  --color-dark-text:  #ecf2f6;

  /* Chart palette */
  --color-chart-blue:   #006876;
  --color-chart-cyan:   #00b6cc;
  --color-chart-indigo: #4d5e85;
  --color-chart-aqua:   #4bd8ee;
  --color-chart-teal:   #26A69A;
  --color-chart-amber:  #FFA726;
  --color-chart-red:    #EF5350;
  --color-chart-green:  #66BB6A;
  --color-chart-purple: #AB47BC;
  --color-chart-orange: #FF7043;

  /* Tipografía */
  --font-family-display:  "Space Grotesk", sans-serif;
  --font-family-headline: "Space Grotesk", sans-serif;
  --font-family-body:     "Inter", sans-serif;
  --font-family-mono:     "JetBrains Mono", monospace;

  /* Sombras */
  --shadow-card:       0 1px 3px rgba(9,29,65,0.06), 0 1px 2px rgba(9,29,65,0.04);
  --shadow-card-hover: 0 4px 16px rgba(9,29,65,0.12), 0 2px 6px rgba(9,29,65,0.07);
  --shadow-card-dark:  0 2px 12px rgba(0,0,0,0.25);

  --radius-card: 12px;
}

html { font-family: "Inter", sans-serif; color: #161c1f; background-color: #f4fafe; }
html.dark { color: #ecf2f6; background-color: #2b3134; }

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(0,182,204,0.3); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(0,182,204,0.6); }
```

> **Nota:** Tailwind v4 CSS-first. **No** crear `tailwind.config.ts`.

---

## 3. Tipografía

- **Display / Labels / Totales** → `Space Grotesk` (700).
- **Body / Texto general** → `Inter` (400–600).
- **Mono (logs, IPs, OIDs)** → `JetBrains Mono`.

### Import en `index.html`

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
  rel="stylesheet">
```

### Escalas

| Uso | Clase Tailwind | Tracking |
|---|---|---|
| Label de card (uppercase) | `text-[10px] font-bold` | `tracking-[0.10em]` |
| Valor grande de card | `text-[2rem] font-bold` (large: `text-[3rem]`) | — |
| Título de sección | `text-[20px] font-bold` | `tracking-[0.06em]` |
| Título ECharts | 16px / 700 | — |
| Body de tabla | `text-[11px] font-medium` | — |
| Tooltip | `text-[12px]` | — |
| Monospace (IPs, OIDs) | `text-[11px] font-mono` | — |

---

## 4. ECharts — tema oficial

Archivo `frontend/src/theme/echarts-agiotech.ts` (copia literal del template, sin cambios):

```typescript
export const CHART_COLORS = [
  '#006876', '#00b6cc', '#4d5e85', '#4bd8ee',
  '#26A69A', '#FFA726', '#EF5350', '#66BB6A',
  '#AB47BC', '#FF7043',
]
```

Más temas `agiotechThemeLight` y `agiotechTheme` (dark) según [05-componentes-ui.md de Agiotech].

### Reglas para gráficas firewall

- **Las 3 WAN** siempre usan los primeros 3 colores en el mismo orden: WAN1=`chartBlue`, WAN2=`chartCyan`, WAN3=`chartIndigo`. Consistencia visual entre paneles.
- **Up vs Down dirección de tráfico**: download = línea, upload = línea con `lineStyle.type: 'dashed'`.
- **Estado**: verde/ámbar/rojo solo para estados, nunca para series neutras.

---

## 5. Componentes obligatorios (copiar literal del template Agiotech)

| Componente | Origen | Adaptación para firewall |
|---|---|---|
| `ClickableKPICard` | template 05 §1 | KPI grande: WAN, CPU, MEM, Sesiones, etc. |
| `BaseChart` | template 05 §2 | Wrapper de ReactECharts con tema light/dark |
| `Header` | template 05 §4 | Logo + selector de rango + refresh + theme toggle |
| `DataModal` | template 05 §3 | Detalle al click (drill-down host/WAN/evento) |
| `DistribucionHeatmap` | template 05 §5 | Heatmaps (saturación hora×día, errores puerto, etc.) |
| `WIPByStatus` (bar) | template 05 §6 | Bar charts genéricos |
| `TipoVisitaChart` (donut) | template 05 §7 | Donuts (estado TCP, distribución de eventos) |

### Componentes nuevos específicos de firewall (a crear)

| Componente | Propósito |
|---|---|
| `WANStatusCard` | KPI card especializada con sparkline incrustado + estado UP/DOWN |
| `WANTrafficChart` | Multi-línea bps in/out de las 3 WAN |
| `LatencyPercentilesChart` | p50/p90/p99 con bandas |
| `TopTalkersBarChart` | Barras horizontales con ranking |
| `EventsFeed` | Tabla virtual con filtros y severidad coloreada |
| `VPNTunnelsGrid` | Grid de tarjetas pequeñas con estado de cada túnel |
| `WANGanttTimeline` | Timeline de uptime/downtime |
| `CalendarHeatmap` | Heatmap calendar 90 días |
| `GeoMap` | Mapa mundial con burbujas (top external talkers) |
| `Treemap` | Composición de tráfico por app/puerto |
| `Sankey` | Flujo VLAN → WAN |

---

## 6. Layout y espaciado

- **Contenedor max**: `max-w-[1600px] mx-auto px-8`.
- **Espacio entre secciones**: `space-y-10`.
- **Gap entre cards de la misma sección**: `gap-4`.
- **Padding interno de card**: `p-5` (estándar), `p-8` (large).
- **Border radius**: `rounded-[12px]` (cards), `rounded-[10px]` (icon backgrounds).
- **Bordes**: `border-[#e9eff3] dark:border-[#252c2f]` 1px. **Nunca** bordes gruesos.

---

## 7. Estados visuales

| Estado | Indicador visual | Texto |
|---|---|---|
| UP saludable | Punto `chartGreen` 8px | "UP" |
| UP con warnings | Punto `chartAmber` 8px | "UP (warn)" |
| DOWN | Punto `chartRed` 8px parpadeante (animate-pulse) | "DOWN" |
| Loading | Skeleton gris claro `bg-surface-block` con shimmer | "—" |
| Sin datos | Texto secundario centrado | "Sin datos" |

Reglas:

1. **El estado nunca depende solo de color** (accesibilidad). Siempre acompañar con texto o icono.
2. **Daltonismo**: para diferenciar UP/DOWN/Warn usar también icono (`CheckCircle`, `AlertTriangle`, `XCircle`) además del color.

---

## 8. Iconos

- Librería única: **`lucide-react`**.
- Tamaño estándar: `size={18}`. En cards `large`: `size={20}`. En tooltips: `size={14}`.
- `strokeWidth={1.8}` siempre.
- Icon background: `rounded-[10px] w-10 h-10` con `backgroundColor: accentColor + '1a'` (10% alpha).

### Mapeo recomendado para firewall

| Concepto | Icono lucide |
|---|---|
| WAN | `Globe` o `Wifi` |
| LAN | `Network` |
| Fibra/SFP | `Cable` |
| CPU | `Cpu` |
| Memoria | `MemoryStick` o `HardDrive` |
| Sesiones | `Activity` |
| VPN tunnel | `Shield` |
| Bloqueo / drop | `Ban` |
| Alerta | `AlertTriangle` |
| Crítico | `AlertOctagon` |
| OK | `CheckCircle` |
| Host | `Monitor` o `Laptop` |
| Tráfico | `TrendingUp` / `TrendingDown` |
| Refresh | `RefreshCw` |
| Theme | `Sun` / `Moon` |
| Búsqueda | `Search` |
| Configuración | `Settings` |

---

## 9. Logo

- Espacio para `frontend/src/img/logo_Blanco.png` (dark mode) y `logotipo_negro.png` (light mode).
- El usuario aporta los PNGs (con transparencia, prefiere SVG si está disponible).
- Si no se aportan, dejar placeholders con `TODO`.

---

## 10. Reglas operativas (resumen)

1. **No inventar colores ni fuentes.** Si lo necesitas, abre un issue.
2. **Todas las cards y gráficas** envueltas en `bg-white dark:bg-[#1e2528] rounded-[12px] p-5` con `shadow-card`.
3. **ECharts**, no Chart.js. Wrapped en `<BaseChart>` que aplica tema light/dark automáticamente.
4. **lucide-react** para todos los iconos. Sin emojis, sin Font Awesome.
5. **Tipografía**: Space Grotesk + Inter + JetBrains Mono.
6. **Dark mode** con clase `.dark` en `<html>`. Toggle persistido en localStorage.
7. **Estado nunca solo por color** — siempre icono + texto + color.
8. **Spacing**: `space-y-10` secciones, `gap-4` cards, `p-5` interno.
9. **Refs cruzados**: este documento es la fuente de verdad visual. Cualquier divergencia en otros docs se resuelve con este.

---

## 11. Anti-patterns

| Mal | Bien |
|---|---|
| Color directo `style={{ color: '#ff0000' }}` | `style={{ color: colors.chartRed }}` |
| Icono emoji | `<AlertTriangle />` de lucide |
| Borde grueso `border-2` | `border-[#e9eff3]` 1px |
| Sombra propia `shadow-lg` | `shadow-card` del @theme |
| Gradient inventado | Stops `chartBlue → chartCyan` |
| Chart.js | ECharts via `<BaseChart>` |
| Texto blanco sobre primary | Texto con `color-dark-text` solo en `.dark` |
| `useState` para tema en cada componente | `useThemeStore` global (Zustand) |
