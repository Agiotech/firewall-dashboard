import { useEffect, useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import { CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react'

import { BaseChart } from './BaseChart'
import { colors } from '../../theme/colors'
import { api } from '../../api/client'

interface Props {
  wans: string[]
  labels: Record<string, string>
  range?: Range
}

interface DowntimeInterval {
  start_ts: number
  end_ts: number
  duration_s: number
  ongoing: boolean
  inferred_recovery: boolean
}

function fmtClock(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

const RANGES = ['24h', '7d', '30d'] as const
type Range = (typeof RANGES)[number]

const WAN_COLORS = [colors.chartBlue, colors.chartCyan, colors.chartIndigo]

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return s > 0 ? `${m}m ${s}s` : `${m}m`
  }
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function WANGanttTimeline({ wans, labels, range: initial = '7d' }: Props) {
  const [range, setRange] = useState<Range>(initial)
  const [data, setData] = useState<Record<string, DowntimeInterval[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    async function load() {
      const next: Record<string, DowntimeInterval[]> = {}
      await Promise.all(
        wans.map(async (w) => {
          try {
            const r = await api.wanDowntime(w, range)
            next[w] = r.data
          } catch {
            next[w] = []
          }
        }),
      )
      if (!cancelled) {
        setData(next)
        setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [wans.join(','), range])

  const rangeS = range === '24h' ? 86400 : range === '30d' ? 30 * 86400 : 7 * 86400
  const now = Date.now()
  const start = now - rangeS * 1000

  const stats = useMemo(() => {
    return wans.map((w, i) => {
      const intervals = data[w] ?? []
      const totalDown = intervals.reduce((s, it) => s + it.duration_s, 0)
      const uptime = rangeS > 0 ? Math.max(0, 100 - (totalDown / rangeS) * 100) : 100
      const longest = intervals.reduce((m, it) => Math.max(m, it.duration_s), 0)
      // Sort by start_ts to find the most recent reliably
      const sorted = [...intervals].sort((a, b) => b.start_ts - a.start_ts)
      const lastInterval = sorted[0] ?? null
      const isCurrentlyDown = !!lastInterval?.ongoing
      // "Activo desde" = end_ts of the last closed outage; null if never had outages
      const recoveredAt = lastInterval && !lastInterval.ongoing ? lastInterval.end_ts : null
      const downSince = isCurrentlyDown ? lastInterval!.start_ts : null
      return {
        wan: w,
        label: labels[w] ?? w,
        color: WAN_COLORS[i % WAN_COLORS.length],
        count: intervals.length,
        totalDown,
        uptimePct: uptime,
        longest,
        isCurrentlyDown,
        recoveredAt,
        downSince,
      }
    })
  }, [wans, data, rangeS, labels])

  const totalIncidents = stats.reduce((s, x) => s + x.count, 0)
  const totalDowntime = stats.reduce((s, x) => s + x.totalDown, 0)

  type GanttItem = [number, number, number, string, string, number, number]

  const items: GanttItem[] = []
  wans.forEach((w, i) => {
    const intervals = data[w] ?? []
    const color = WAN_COLORS[i % WAN_COLORS.length]
    intervals.forEach((it) => {
      items.push([
        i,
        it.start_ts * 1000,
        it.end_ts * 1000,
        labels[w] ?? w,
        color,
        it.ongoing ? 1 : 0,
        it.inferred_recovery ? 1 : 0,
      ])
    })
  })

  const option: EChartsOption = {
    grid: { top: 20, right: 24, bottom: 30, left: 12, containLabel: true },
    xAxis: {
      type: 'time',
      min: start,
      max: now,
      axisLabel: { fontSize: 10, color: '#4d5e85' },
      splitLine: { show: true, lineStyle: { color: '#e9eff3', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: wans.map((w) => labels[w] ?? w),
      axisLabel: { fontSize: 11, color: '#4d5e85', fontWeight: 500 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(30,37,40,0.95)',
      borderWidth: 0,
      padding: 10,
      textStyle: { color: '#ecf2f6', fontSize: 11 },
      formatter: (params: any) => {
        const v = params.value as GanttItem
        const startD = new Date(v[1]).toLocaleString('es-MX', {
          dateStyle: 'short', timeStyle: 'medium',
        })
        const endD = new Date(v[2]).toLocaleString('es-MX', {
          dateStyle: 'short', timeStyle: 'medium',
        })
        const dur = Math.round((v[2] - v[1]) / 1000)
        const ongoing = v[5] === 1
        const inferred = v[6] === 1
        const title = ongoing ? `▼ ${v[3]} — EN CAÍDA AHORA` : `▼ ${v[3]} — CAÍDA`
        const endLabel = ongoing ? 'ACTUAL (en curso)' : endD
        const durLabel = ongoing ? `lleva ${formatDuration(dur)}` : formatDuration(dur)
        const inferredNote = inferred
          ? `<div style="border-top:1px solid rgba(255,255,255,0.15);padding-top:6px;margin-top:6px;` +
            `font-size:10px;color:${colors.chartAmber}">` +
            `⚑ Recuperación inferida por tráfico — el USG no emitió evento ALIVE.</div>`
          : ''
        return (
          `<div style="font-family:Space Grotesk,sans-serif">` +
          `<div style="font-weight:bold;color:${colors.chartRed};margin-bottom:6px">${title}</div>` +
          `<div style="opacity:0.7;font-size:10px;margin-bottom:2px">INICIO</div>` +
          `<div style="font-family:JetBrains Mono,monospace;margin-bottom:4px">${startD}</div>` +
          `<div style="opacity:0.7;font-size:10px;margin-bottom:2px">FIN</div>` +
          `<div style="font-family:JetBrains Mono,monospace;margin-bottom:6px">${endLabel}</div>` +
          `<div style="border-top:1px solid rgba(255,255,255,0.15);padding-top:6px">` +
          `<span style="opacity:0.7">Duración: </span>` +
          `<b style="color:${colors.chartAmber}">${durLabel}</b></div>` +
          inferredNote +
          `</div>`
        )
      },
    },
    series: [
      {
        type: 'custom',
        renderItem: (_p: any, apiCb: any) => {
          const yIdx = apiCb.value(0)
          const isOngoing = apiCb.value(5) === 1
          const startCoord = apiCb.coord([apiCb.value(1), yIdx])
          const endCoord = apiCb.coord([apiCb.value(2), yIdx])
          const rowHeight = apiCb.size([0, 1])[1]
          const visualHeight = rowHeight * 0.55
          const visualWidth = Math.max(8, endCoord[0] - startCoord[0])
          const hitWidth = Math.max(16, visualWidth + 12)
          const fillColor = isOngoing ? colors.chartAmber : colors.chartRed
          return {
            type: 'group',
            children: [
              {
                type: 'rect',
                shape: {
                  x: startCoord[0] - (hitWidth - visualWidth) / 2,
                  y: startCoord[1] - rowHeight / 2,
                  width: hitWidth,
                  height: rowHeight,
                },
                style: { fill: 'transparent' },
                silent: false,
              },
              {
                type: 'rect',
                shape: {
                  x: startCoord[0],
                  y: startCoord[1] - visualHeight / 2,
                  width: visualWidth,
                  height: visualHeight,
                  r: 2,
                },
                style: {
                  fill: fillColor,
                  opacity: isOngoing ? 0.95 : 0.9,
                  shadowColor: fillColor,
                  shadowBlur: isOngoing ? 10 : 4,
                  stroke: isOngoing ? fillColor : undefined,
                  lineWidth: isOngoing ? 2 : 0,
                  lineDash: isOngoing ? [4, 2] : undefined,
                },
                silent: true,
              },
            ],
          }
        },
        encode: { x: [1, 2], y: 0 },
        emphasis: {
          itemStyle: { shadowBlur: 12, shadowColor: colors.chartRed },
        },
        data: items,
      },
    ],
  }

  const hasAnyDown = totalIncidents > 0

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      {/* Header con título + selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <p
            className="text-[14px] font-bold text-[#161c1f] dark:text-[#ecf2f6]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Caídas WAN
          </p>
          <span
            className="text-[10px] uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            últimos {range}
          </span>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-[0.06em] transition-colors ${
                range === r
                  ? 'bg-[#006876] text-white'
                  : 'bg-[#eef4f8] dark:bg-[#252c2f] text-[#4d5e85] dark:text-[#a8c4cc] hover:bg-[#dde3e7] dark:hover:bg-[#2b3134]'
              }`}
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards por WAN */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        {stats.map((s) => {
          const isHealthy = s.count === 0
          const isCritical = s.uptimePct < 99 || s.isCurrentlyDown
          const StatusIcon = isHealthy ? CheckCircle2 : isCritical ? AlertTriangle : AlertCircle
          const statusColor = isHealthy ? colors.chartGreen : isCritical ? colors.chartRed : colors.chartAmber

          let statusBadge: { text: string; color: string; pulse: boolean }
          if (s.isCurrentlyDown && s.downSince) {
            statusBadge = {
              text: `Caído desde ${fmtClock(s.downSince)}`,
              color: colors.chartRed,
              pulse: true,
            }
          } else if (s.recoveredAt) {
            statusBadge = {
              text: `Activo desde ${fmtClock(s.recoveredAt)}`,
              color: colors.chartGreen,
              pulse: false,
            }
          } else {
            statusBadge = {
              text: `Estable últimos ${range}`,
              color: colors.chartGreen,
              pulse: false,
            }
          }

          return (
            <div
              key={s.wan}
              className="rounded-[10px] p-3 border"
              style={{
                backgroundColor: statusColor + '0a',
                borderColor: statusColor + '33',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span
                    className="text-[11px] font-bold text-[#161c1f] dark:text-[#ecf2f6] truncate"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                    title={s.label}
                  >
                    {s.label}
                  </span>
                </div>
                <StatusIcon size={14} style={{ color: statusColor }} strokeWidth={2} />
              </div>

              {/* Estado actual — siempre visible para evitar ambigüedad */}
              <div
                className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-md"
                style={{ backgroundColor: statusBadge.color + '14' }}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusBadge.pulse ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: statusBadge.color }}
                />
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.06em]"
                  style={{ color: statusBadge.color, fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  {statusBadge.text}
                </span>
              </div>

              <div className="flex items-baseline gap-1 mb-1">
                <span
                  className="text-[20px] font-bold leading-none"
                  style={{
                    color: statusColor,
                    fontFamily: 'Space Grotesk, sans-serif',
                  }}
                >
                  {s.uptimePct.toFixed(s.uptimePct === 100 ? 0 : 2)}
                </span>
                <span
                  className="text-[10px] font-bold"
                  style={{ color: statusColor, fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  %
                </span>
                <span className="text-[9px] uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc] ml-1">
                  uptime
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 mt-2">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.06em] text-[#4d5e85] dark:text-[#a8c4cc]">
                    Caídas
                  </p>
                  <p
                    className="text-[12px] font-bold text-[#161c1f] dark:text-[#ecf2f6]"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {s.count}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.06em] text-[#4d5e85] dark:text-[#a8c4cc]">
                    Tot. down
                  </p>
                  <p
                    className="text-[12px] font-bold text-[#161c1f] dark:text-[#ecf2f6]"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {s.totalDown > 0 ? formatDuration(s.totalDown) : '—'}
                  </p>
                </div>
              </div>
              {s.longest > 0 && (
                <p
                  className="text-[9px] text-[#4d5e85] dark:text-[#a8c4cc] mt-1"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  Más larga: <span className="font-mono">{formatDuration(s.longest)}</span>
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Timeline */}
      <div className="mb-2 flex items-center justify-between">
        <p
          className="text-[10px] uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          Línea de tiempo
        </p>
        {hasAnyDown && (
          <p className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc]">
            {totalIncidents} caída{totalIncidents !== 1 ? 's' : ''} · {formatDuration(totalDowntime)} acumulado
          </p>
        )}
      </div>

      {loading ? (
        <div className="h-[140px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          Cargando…
        </div>
      ) : !hasAnyDown ? (
        <div
          className="flex items-center justify-center gap-2 py-6 rounded-[10px]"
          style={{ backgroundColor: colors.chartGreen + '14', border: `1px solid ${colors.chartGreen}33` }}
        >
          <CheckCircle2 size={16} style={{ color: colors.chartGreen }} strokeWidth={2} />
          <p
            className="text-[12px] font-bold"
            style={{ color: colors.chartGreen, fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Sin caídas en los últimos {range}
          </p>
        </div>
      ) : (
        <BaseChart
          option={option}
          height={Math.max(140, wans.length * 44 + 60)}
          noZoom
        />
      )}
    </div>
  )
}
