import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

import { api } from '../../api/client'
import { useThemeStore } from '../../stores/themeStore'
import { formatBytes } from '../../utils/format'

const RANGES = ['7d', '30d', '90d'] as const
type Range = (typeof RANGES)[number]

function shortLabel(name: string): string {
  return name.replace('VPN-', '').replace('GDL-', '')
}

function fmtDay(ts: number): string {
  const d = new Date(ts * 1000)
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
}

export function VpnDailyHeatmap() {
  const [range, setRange] = useState<Range>('30d')
  const [data, setData] = useState<{ tunnel: string; day_ts: number; bytes_total: number }[]>([])
  const [tunnels, setTunnels] = useState<{ name: string; bytes_total: number }[]>([])
  const [days, setDays] = useState<number[]>([])
  const [configured, setConfigured] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const isDark = useThemeStore((s) => s.isDark)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const load = () => {
      api.vpnDailyHeatmap(range).then((r) => {
        if (cancelled) return
        setData(r.data)
        setTunnels(r.tunnels)
        setDays(r.days)
        setConfigured(r.configured_count)
        setLoading(false)
      }).catch(() => { if (!cancelled) setLoading(false) })
    }
    load()
    const id = setInterval(load, 300_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [range])

  const tunnelNames = useMemo(() => tunnels.map((t) => t.name), [tunnels])
  const tunnelIndex = useMemo(() => {
    const m = new Map<string, number>()
    tunnelNames.forEach((n, i) => m.set(n, i))
    return m
  }, [tunnelNames])
  const dayIndex = useMemo(() => {
    const m = new Map<number, number>()
    days.forEach((d, i) => m.set(d, i))
    return m
  }, [days])

  const cells = useMemo(() => {
    return data
      .map((r) => {
        const x = dayIndex.get(r.day_ts)
        const y = tunnelIndex.get(r.tunnel)
        if (x === undefined || y === undefined) return null
        return [x, y, r.bytes_total]
      })
      .filter((v): v is [number, number, number] => v !== null)
  }, [data, dayIndex, tunnelIndex])

  const max = useMemo(() => Math.max(1, ...cells.map((c) => c[2])), [cells])
  const grandTotal = useMemo(() => tunnels.reduce((s, t) => s + t.bytes_total, 0), [tunnels])
  const topConsumer = tunnels.length > 0 ? tunnels[0] : null

  const yLabels = useMemo(() => tunnels.map((t) => {
    const pct = grandTotal > 0 ? Math.round((t.bytes_total / grandTotal) * 100) : 0
    return `${shortLabel(t.name)}  ·  ${formatBytes(t.bytes_total)} (${pct}%)`
  }), [tunnels, grandTotal])

  const xLabels = useMemo(() => days.map(fmtDay), [days])

  const option: EChartsOption = {
    title: { text: `Consumo diario por VPN (${range})`, left: 0 },
    grid: { top: 50, right: 20, bottom: 40, left: 30, containLabel: true },
    tooltip: {
      formatter: (params: any) => {
        const [x, y, bytes] = params.data as [number, number, number]
        return `<b>${tunnelNames[y]}</b><br/>${xLabels[x]}<br/>${formatBytes(bytes)}`
      },
    },
    xAxis: {
      type: 'category',
      data: xLabels,
      axisLabel: { fontSize: 9, rotate: range === '90d' ? 60 : 0 },
      splitArea: { show: false },
    },
    yAxis: {
      type: 'category',
      data: yLabels,
      axisLabel: { fontSize: 10 },
      splitArea: { show: false },
    },
    visualMap: {
      show: false,
      min: 0,
      max,
      inRange: {
        color: isDark
          ? ['#1e2528', '#006876', '#00b6cc', '#FFA726', '#EF5350']
          : ['#eef4f8', '#006876', '#00b6cc', '#FFA726', '#EF5350'],
      },
    },
    series: [{ type: 'heatmap', data: cells, itemStyle: { borderRadius: 2 } }],
  }

  const height = Math.max(280, tunnels.length * 28 + 100)

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label
          className="text-[10px] uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          Rango
        </label>
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

        {topConsumer && grandTotal > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span
              className="text-[10px] uppercase tracking-[0.06em] text-[#4d5e85] dark:text-[#a8c4cc]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Top consumidor
            </span>
            <span
              className="text-[11px] font-bold text-[#161c1f] dark:text-[#ecf2f6]"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              {shortLabel(topConsumer.name)} · {formatBytes(topConsumer.bytes_total)}
            </span>
          </div>
        )}
      </div>

      {configured === 0 ? (
        <div className="h-[280px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8">
          Configura túneles en VPN_REMOTE_SUBNETS para ver el consumo diario.
        </div>
      ) : loading && cells.length === 0 ? (
        <div className="h-[280px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          Cargando…
        </div>
      ) : grandTotal === 0 ? (
        <div className="h-[280px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8">
          Aún no hay tráfico registrado en este rango.
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: `${height}px`, width: '100%' }} notMerge />
      )}
    </div>
  )
}
