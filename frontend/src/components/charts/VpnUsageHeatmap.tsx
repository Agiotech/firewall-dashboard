import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

import { api } from '../../api/client'
import { useThemeStore } from '../../stores/themeStore'
import { formatBytes } from '../../utils/format'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const HOURS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}h`)
const RANGES = ['7d', '30d', '90d'] as const
type Range = (typeof RANGES)[number]

export function VpnUsageHeatmap() {
  const [tunnels, setTunnels] = useState<{ name: string; configured: boolean; bytes_total: number }[]>([])
  const [selected, setSelected] = useState<string>('')
  const [range, setRange] = useState<Range>('30d')
  const [cells, setCells] = useState<{ dow: number; hour: number; bytes_total: number }[]>([])
  const [configured, setConfigured] = useState<boolean>(true)
  const [loading, setLoading] = useState(true)
  const isDark = useThemeStore((s) => s.isDark)

  useEffect(() => {
    let cancelled = false
    api.vpnTraffic('30d').then((r) => {
      if (cancelled) return
      const list = r.data
        .map((t) => ({ name: t.tunnel, configured: t.configured, bytes_total: t.bytes_total }))
        .filter((t) => t.configured)
        .sort((a, b) => b.bytes_total - a.bytes_total)
      setTunnels(list)
      if (list.length > 0 && !selected) setSelected(list[0].name)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoading(true)
    const load = () => {
      api.vpnUsageHeatmap(selected, range).then((r) => {
        if (cancelled) return
        setCells(r.data)
        setConfigured(r.configured)
        setLoading(false)
      }).catch(() => { if (!cancelled) setLoading(false) })
    }
    load()
    const id = setInterval(load, 300_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [selected, range])

  const max = useMemo(() => Math.max(1, ...cells.map((c) => c.bytes_total)), [cells])
  const matrix = useMemo(() => cells.map((c) => [c.hour, c.dow, c.bytes_total]), [cells])

  const option: EChartsOption = {
    title: { text: `Uso semanal — ${selected.replace('VPN-', '').replace('GDL-', '')} (${range})`, left: 0 },
    grid: { top: 50, right: 20, bottom: 30, left: 30, containLabel: true },
    tooltip: {
      formatter: (params: any) => {
        const [hour, dow, bytes] = params.data as [number, number, number]
        return `<b>${DAYS[dow]} ${HOURS[hour]}</b><br/>${formatBytes(bytes)}`
      },
    },
    xAxis: { type: 'category', data: HOURS, axisLabel: { fontSize: 9 }, splitArea: { show: false } },
    yAxis: { type: 'category', data: DAYS, axisLabel: { fontSize: 10 }, splitArea: { show: false } },
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
    series: [{ type: 'heatmap', data: matrix, itemStyle: { borderRadius: 2 } }],
  }

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
          Túnel
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="text-[11px] px-2 py-1 rounded-md bg-[#eef4f8] dark:bg-[#252c2f] text-[#161c1f] dark:text-[#ecf2f6] border border-[#e9eff3] dark:border-[#252c2f] outline-none"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          {tunnels.length === 0 && <option value="">— sin túneles configurados —</option>}
          {tunnels.map((t) => (
            <option key={t.name} value={t.name}>{t.name}</option>
          ))}
        </select>

        <label
          className="ml-3 text-[10px] uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc]"
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
      </div>

      {!selected ? (
        <div className="h-[240px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8">
          Configura al menos un túnel en VPN_REMOTE_SUBNETS para ver su patrón de uso.
        </div>
      ) : loading && cells.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          Cargando…
        </div>
      ) : !configured ? (
        <div className="h-[240px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8">
          Este túnel no tiene subnet remota configurada.
        </div>
      ) : cells.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8">
          Aún no hay tráfico registrado en este rango para este túnel.
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: '240px', width: '100%' }} notMerge />
      )}
    </div>
  )
}
