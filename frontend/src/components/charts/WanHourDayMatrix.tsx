import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

import { useThemeStore } from '../../stores/themeStore'

type Cell = { dow: number; hour: number; value: number }

interface Props {
  wan: string
  label?: string
  range: string
  data: Cell[]
  loading: boolean
  globalMax: number
  /** Tooltip value formatter (e.g. formatBps or formatBytes). */
  formatValue: (v: number) => string
  /** Title prefix shown before the WAN name. */
  titlePrefix: string
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const HOURS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}h`)

export function WanHourDayMatrix({
  wan, label, range, data, loading, globalMax, formatValue, titlePrefix,
}: Props) {
  const isDark = useThemeStore((s) => s.isDark)
  const cells = data.map((d) => [d.hour, d.dow, d.value])

  const option: EChartsOption = {
    title: { text: `${titlePrefix} — ${label ?? wan} (${range})`, left: 0 },
    grid: { top: 50, right: 10, bottom: 30, left: 30, containLabel: true },
    tooltip: {
      formatter: (params: any) => {
        const [hour, dow, v] = params.data as [number, number, number]
        return `<b>${DAYS[dow]} ${HOURS[hour]}</b><br/>${formatValue(v)}`
      },
    },
    xAxis: { type: 'category', data: HOURS, axisLabel: { fontSize: 9 }, splitArea: { show: false } },
    yAxis: { type: 'category', data: DAYS, axisLabel: { fontSize: 10 }, splitArea: { show: false } },
    visualMap: {
      show: false,
      min: 0,
      max: globalMax,
      inRange: {
        color: isDark
          ? ['#1e2528', '#006876', '#00b6cc', '#FFA726', '#EF5350']
          : ['#eef4f8', '#006876', '#00b6cc', '#FFA726', '#EF5350'],
      },
    },
    series: [{ type: 'heatmap', data: cells, itemStyle: { borderRadius: 2 } }],
  }

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      {loading && cells.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          Cargando…
        </div>
      ) : cells.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8">
          Aún no hay suficiente historia para detectar patrones en este rango
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: '220px', width: '100%' }} notMerge />
      )}
    </div>
  )
}
