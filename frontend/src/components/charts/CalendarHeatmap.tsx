import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

import { api } from '../../api/client'
import { useThemeStore } from '../../stores/themeStore'

interface Props {
  wan: string
  label?: string
  days?: number
}

interface AvailabilityDay {
  day_ts: number
  uptime_pct: number
  down_seconds: number
  samples: number
}

function fmtDuration(s: number): string {
  if (s <= 0) return '0s'
  if (s < 60) return `${s}s`
  if (s < 3600) {
    const m = Math.floor(s / 60)
    const r = s % 60
    return r > 0 ? `${m}m ${r}s` : `${m}m`
  }
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function CalendarHeatmap({ wan, label, days = 90 }: Props) {
  const [data, setData] = useState<AvailabilityDay[]>([])
  const [loading, setLoading] = useState(true)
  const isDark = useThemeStore((s) => s.isDark)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await api.wanAvailability(wan, days)
        if (!cancelled) {
          setData(r.data)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 300_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [wan, days])

  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - days)

  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const cellData = data.map((d) => {
    const date = new Date(d.day_ts * 1000)
    return [fmt(date), d.uptime_pct, d.down_seconds]
  })

  const option: EChartsOption = {
    title: { text: `Disponibilidad — ${label ?? wan} (${days}d)`, left: 0 },
    tooltip: {
      backgroundColor: 'rgba(30,37,40,0.95)',
      borderWidth: 0,
      padding: 10,
      textStyle: { color: '#ecf2f6', fontSize: 11 },
      formatter: (params: any) => {
        const [date, pct, down] = params.value as [string, number, number]
        const color = pct >= 100 ? '#66BB6A' : pct >= 90 ? '#FFA726' : '#EF5350'
        const downText = down > 0 ? fmtDuration(down) : 'sin incidentes'
        return (
          `<div style="font-family:Space Grotesk,sans-serif">` +
          `<div style="font-weight:bold;margin-bottom:6px">${date}</div>` +
          `<div style="opacity:0.7;font-size:10px">UPTIME</div>` +
          `<div style="color:${color};font-weight:bold;font-size:14px;margin-bottom:4px">` +
          `${pct.toFixed(2)}%</div>` +
          `<div style="opacity:0.7;font-size:10px">DOWN ACUMULADO</div>` +
          `<div style="font-family:JetBrains Mono,monospace">${downText}</div>` +
          `<div style="opacity:0.5;font-size:9px;margin-top:6px;border-top:1px solid rgba(255,255,255,0.15);padding-top:4px">` +
          `Fuente: Connectivity Check (USG)</div>` +
          `</div>`
        )
      },
    },
    visualMap: {
      type: 'piecewise',
      show: false,
      dimension: 1,
      pieces: [
        { lt: 90, color: '#EF5350' },
        { gte: 90, lt: 100, color: '#FFA726' },
        { gte: 100, color: '#66BB6A' },
      ],
    },
    calendar: {
      top: 60,
      left: 30,
      right: 30,
      range: [fmt(from), fmt(today)],
      cellSize: ['auto', 14],
      itemStyle: { borderWidth: 2, borderColor: isDark ? '#2b3134' : '#f4fafe' },
      splitLine: { show: false },
      yearLabel: { show: false },
      monthLabel: { color: isDark ? '#a8c4cc' : '#4d5e85', fontSize: 10 },
      dayLabel: { color: isDark ? '#a8c4cc' : '#4d5e85', fontSize: 9, firstDay: 1 },
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: cellData,
      },
    ],
  }

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      {loading ? (
        <div className="h-[180px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          Cargando…
        </div>
      ) : cellData.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          Aún no hay suficiente historia para esta WAN
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: '180px', width: '100%' }} notMerge />
      )}
    </div>
  )
}
