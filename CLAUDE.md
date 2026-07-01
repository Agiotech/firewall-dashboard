# CLAUDE.md — Reglas de operación del proyecto

Este archivo es leído automáticamente por Claude Code al trabajar en este repositorio. Define límites operativos no negociables.

---

## 1. Modo solo-lectura sobre el firewall

El propósito de este proyecto es **observar** el USG Flex 700H, no administrarlo. Por lo tanto:

### Prohibido

- NO ejecutar comandos de configuración por SSH (`configure`, `interface ... ip`, `policy`, `object-group`, etc.). Solo se permiten comandos `show ...` y `debug ...` cuya naturaleza sea de lectura.
- NO usar `SNMP SET`. Únicamente `SNMP GET` y `SNMP GETBULK`.
- NO usar la API REST del USG ni del Nebula Cloud para modificar configuración.
- NO crear, modificar ni eliminar reglas, objetos, políticas, rutas, usuarios, certificados, VPNs, ni interfaces.
- NO reiniciar servicios, sesiones, túneles, ni el equipo.
- NO emitir `write memory`, `save`, `commit`, ni equivalentes.

### Permitido

- Recibir tráfico de **Syslog** que el firewall envíe al servidor (es push del firewall, no escritura desde nuestro lado).
- Recibir flujos **NetFlow / sFlow** exportados por el firewall.
- Hacer **polling SNMP de lectura** a OIDs estándar (MIB-II) y a OIDs propietarios de Zyxel.
- Hacer **ping / traceroute** desde el host del dashboard hacia internet para medir latencia y pérdida (esto no toca el firewall, mide el camino).

### Cuando el usuario pida algo que requiera cambio en el firewall

Si una mejora o feature solicitada implica modificar configuración del USG (ej. "habilita SNMP", "agrega una regla", "expón un puerto"), Claude debe:

1. **Negarse a hacerlo automáticamente.**
2. **Documentar el cambio** que el usuario debe aplicar manualmente en la UI del Zyxel (`Configuration → ...`) o en CLI, paso por paso.
3. Esperar confirmación verbal del usuario de que ya lo aplicó antes de seguir.

Esto aplica también a habilitar SNMP, syslog server, NetFlow, etc. Son acciones del usuario, no de la herramienta.

---

## 2. Variables de entorno — única fuente de configuración

### Regla

**Todo** valor que cambie entre entornos, sea sensible, o sea específico de la infraestructura, vive en `.env` y se accede únicamente vía `app/config.py` (pydantic-settings).

Prohibido:
- Hardcodear IPs, credenciales SNMP, contraseñas, hosts, puertos, secretos o tokens en código fuente.
- Comitear el archivo `.env` real. Solo se comitea `.env.example` con valores ficticios.
- Leer `os.environ` directamente fuera de `config.py`.

### Catálogo de variables

Toda variable nueva DEBE registrarse en:
1. `.env.example` con un valor placeholder y un comentario.
2. `app/config.py` como atributo tipado de `Settings`.
3. `docs/CONFIG.md` (o sección equivalente) con su descripción y rango.

### Categorías de variables

| Categoría | Ejemplos | Sensible |
|---|---|---|
| Firewall / SNMP | `FIREWALL_HOST`, `SNMP_USER`, `SNMP_AUTH_KEY`, `SNMP_PRIV_KEY` | Sí |
| Syslog | `SYSLOG_BIND_HOST`, `SYSLOG_BIND_PORT` | No |
| API web | `API_HOST`, `API_PORT` | No |
| Persistencia | `DB_PATH`, `RETENTION_DAYS` | No |
| Polling | `POLL_INTERVAL_SECONDS` | No |
| Topología | `WAN_INTERFACES`, `LAN_INTERFACES` | No |
| Modo | `MOCK_MODE` | No |
| Alertas | `ALERT_EMAIL_*`, `ALERT_WEBHOOK_URL` | Sí |

### Archivos de secretos

- `.env` — local, NO se comitea (ignorado por `.gitignore`).
- `.env.example` — comiteado, sin secretos reales.
- En producción, los valores sensibles pueden venir de variables de entorno del SO o de un secret manager; `pydantic-settings` los toma transparentemente.

---

## 3. Estilo de código y mantenimiento

### Backend (`backend/`)

- Python 3.11+ async donde aplique (FastAPI, aiosqlite, pysnmp).
- Imports tipados, sin `Any` salvo en parsers.
- No agregar dependencias sin justificar en el PR/cambio.
- Comentarios solo cuando el "por qué" no sea obvio.
- No documentar el "qué" del código en docstrings largos — los nombres deben hablar.

### Frontend (`frontend/`)

- React + Vite + TypeScript + Tailwind v4 (CSS-first) + ECharts + Zustand.
- **Sin** `tailwind.config.ts`. Toda la config va en `index.css` con `@theme {}`.
- **ECharts** vía `echarts-for-react`, envuelto en `BaseChart`. Prohibido Chart.js, prohibido invocar ECharts directo en componentes finales (excepto donuts/pies pequeños según template).
- Iconos: **únicamente** `lucide-react`. Sin emojis, sin Font Awesome, sin Material Icons.
- Tipografía: Space Grotesk (display) + Inter (body) + JetBrains Mono (mono).
- Un componente = un archivo. No mezclar más de una card/chart por archivo.

---

## 4. Design system (Agiotech) — no negociable

El proyecto adopta literalmente el design system Agiotech (ver [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)). Reglas absolutas:

### Prohibido

- Inventar colores nuevos. La paleta es la definida en `theme/colors.ts` y `@theme`.
- Inventar fuentes nuevas. Las tres permitidas son Space Grotesk, Inter, JetBrains Mono.
- Usar bordes gruesos (`border-2`, `border-4`). Siempre 1px con `border-[#e9eff3] dark:border-[#252c2f]`.
- Usar sombras propias (`shadow-lg`, `shadow-2xl`). Solo las del `@theme`: `shadow-card`, `shadow-card-hover`, `shadow-card-dark`.
- Indicar estado solo por color (accesibilidad / daltonismo). Siempre acompañar con icono o texto.
- Hardcodear hex en componentes. Usar tokens (`colors.chartGreen`, `var(--color-chart-green)`, o `theme()` de Tailwind).
- Romper la estructura literal de los componentes del template (`ClickableKPICard`, `BaseChart`, `DataModal`, `Header`).

### Obligatorio

- Toda card/gráfica envuelta en `bg-white dark:bg-[#1e2528] rounded-[12px] p-5` con `shadow-card`.
- Tema dark con clase `.dark` en `<html>` (strategy class). Estado global en `useThemeStore` (Zustand) con persistencia en `localStorage`.
- Mapeo semántico de colores según [DESIGN_SYSTEM.md §1.2](docs/DESIGN_SYSTEM.md).
- Las 3 WAN usan siempre los mismos colores en el mismo orden: WAN1=`chartBlue`, WAN2=`chartCyan`, WAN3=`chartIndigo`.

### Cuando el usuario pida algo fuera del design system

Si una solicitud implica romper estas reglas (ej. "ponme botones rojos brillantes" o "usa Material UI"), Claude debe:

1. Negarse a aplicarlo automáticamente.
2. Explicar la regla y proponer la alternativa dentro del sistema.
3. Si el usuario insiste tras la explicación, aplicarlo pero dejar comentario `// DESIGN-OVERRIDE: <fecha> <motivo>` y registrar el override en `docs/DESIGN_OVERRIDES.md`.

---

## 5. Datos almacenados

- SQLite con WAL. Un archivo en `backend/data/dashboard.db`.
- Retención configurable por `RETENTION_DAYS_*` (raw / 5m / 1h / eventos).
- Los rollups (5min, 1h) se generan en background; los datos crudos se purgan al cumplir la retención.
- Nunca exponer la DB raw vía API sin sanitización (no SQL dinámico desde frontend).

---

## 6. Estructura del proyecto

Monorepo:

```
dashboard/
├── backend/    # FastAPI + APScheduler + SQLite WAL
└── frontend/   # React + Vite + TS + Tailwind v4 + ECharts
```

- Vite compila a `backend/static/` y FastAPI lo sirve. Un solo proceso.
- Detalles en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).
- Cualquier archivo nuevo va en la carpeta que le corresponde por capa (ver responsabilidades en ARQUITECTURA.md §"Responsabilidades por capa"). No mezclar.

---

## 7. Errores y observabilidad

- Si el poller SNMP no puede contactar el firewall, registrar evento en `events` con `category='monitor'` y `priority='error'`, pero **no** reintentar agresivamente — backoff exponencial con tope.
- El listener de syslog debe ser tolerante a líneas mal formadas: registrar en `events` con `priority='warning'` y seguir.
- Logs de la aplicación van a stdout (uvicorn) en formato estructurado simple.
- El frontend muestra estados explícitos: `Loading` (skeleton), `Empty` (sin datos), `Error` (banner amarillo con reintento). Nunca pantalla en blanco.

---

## 8. Resumen ejecutivo

| Pregunta | Respuesta |
|---|---|
| ¿Puedo cambiar algo en el firewall vía este código? | **No.** Read-only siempre. |
| ¿Dónde van las credenciales? | En `backend/.env`, accedidas vía `backend/app/config.py`. |
| ¿Puedo hardcodear la IP del firewall? | **No.** Va en `FIREWALL_HOST`. |
| ¿Quién enciende SNMP / Syslog en el USG? | El usuario, manualmente, siguiendo [`docs/CONFIG_FIREWALL.md`](docs/CONFIG_FIREWALL.md). |
| ¿Qué pasa si el usuario me pide hacer un cambio en el firewall? | Documentar el procedimiento manual y esperar que el usuario lo aplique. |
| ¿Puedo usar Chart.js? | **No.** ECharts vía `BaseChart`. |
| ¿Puedo inventar un color nuevo? | **No.** Paleta cerrada en [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md). |
| ¿Puedo usar emojis para estados? | **No.** Iconos `lucide-react` + texto + color. |
| ¿Puedo usar `tailwind.config.ts`? | **No.** Tailwind v4 CSS-first, todo en `index.css @theme`. |
