import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

import { api } from '../../api/client'
import { useThemeStore } from '../../stores/themeStore'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const HOURS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}h`)

export function EventsHourDayHeatmap({ range = '7d' }: { range?: string }) {
  const [rows, setRows] = useState<{ dow: number; hour: number; n: number }[]>([])
  const [loading, setLoading] = useState(true)
  const isDark = useThemeStore((s) => s.isDark)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await api.heatmapEvents(range)
        if (!cancelled) { setRows(r.data); setLoading(false) }
      } catch { if (!cancelled) setLoading(false) }
    }
    load()
    const id = setInterval(load, 300_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [range])

  const cells = rows.map((r) => [r.hour, r.dow, r.n])
  const max = Math.max(1, ...rows.map((r) => r.n))

  const option: EChartsOption = {
    title: { text: `Eventos por hora × día (${range})`, left: 0 },
    grid: { top: 40, right: 10, bottom: 30, left: 30, containLabel: true },
    xAxis: { type: 'category', data: HOURS, axisLabel: { fontSize: 9 } },
    yAxis: { type: 'category', data: DAYS, axisLabel: { fontSize: 10 } },
    tooltip: {
      formatter: (params: any) => {
        const [h, d, n] = params.data
        return `<b>${DAYS[d]} ${HOURS[h]}</b><br/>${n.toLocaleString('es-MX')} eventos`
      },
    },
    visualMap: {
      show: false,
      min: 0, max,
      inRange: { color: isDark ? ['#1e2528', '#4d5e85', '#00b6cc', '#FFA726', '#EF5350'] : ['#eef4f8', '#4d5e85', '#00b6cc', '#FFA726', '#EF5350'] },
    },
    series: [{ type: 'heatmap', data: cells, itemStyle: { borderRadius: 2 } }],
  }

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      {loading && cells.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">Cargando...</div>
      ) : cells.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">Aún no hay suficiente historia</div>
      ) : (
        <ReactECharts option={option} style={{ height: '220px', width: '100%' }} notMerge />
      )}
    </div>
  )
}
