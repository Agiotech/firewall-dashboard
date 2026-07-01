import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

import { api } from '../../api/client'
import { useThemeStore } from '../../stores/themeStore'
import { formatBps } from '../../utils/format'

type Cell = { dow: number; hour: number; bps_avg: number }

interface Props {
  wan: string
  label?: string
  range?: string
  /** Pre-fetched data; if provided, the component skips its own fetch. */
  data?: Cell[]
  /** Shared visualMap max so multiple heatmaps stay color-comparable. */
  globalMax?: number
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const HOURS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}h`)

export function HourDayHeatmap({ wan, label, range = '30d', data: externalData, globalMax }: Props) {
  const [internalData, setInternalData] = useState<Cell[]>([])
  const [loading, setLoading] = useState(externalData === undefined)
  const isDark = useThemeStore((s) => s.isDark)

  useEffect(() => {
    if (externalData !== undefined) return  // parent supplies data, no fetch
    let cancelled = false
    async function load() {
      try {
        const r = await api.heatmapWanSaturation(wan, range)
        if (!cancelled) {
          setInternalData(r.data)
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
  }, [wan, range, externalData !== undefined])

  const data = externalData ?? internalData
  const cells = data.map((d) => [d.hour, d.dow, d.bps_avg])
  const localMax = Math.max(1, ...data.map((d) => d.bps_avg))
  const max = globalMax ?? localMax

  const option: EChartsOption = {
    title: { text: `Patrón hora × día — ${label ?? wan} (${range})`, left: 0 },
    grid: { top: 50, right: 10, bottom: 30, left: 30, containLabel: true },
    tooltip: {
      formatter: (params: any) => {
        const [hour, dow, bps] = params.data as [number, number, number]
        return `<b>${DAYS[dow]} ${HOURS[hour]}</b><br/>${formatBps(bps)} avg`
      },
    },
    xAxis: {
      type: 'category',
      data: HOURS,
      axisLabel: { fontSize: 9 },
      splitArea: { show: false },
    },
    yAxis: {
      type: 'category',
      data: DAYS,
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
    series: [
      {
        type: 'heatmap',
        data: cells,
        itemStyle: { borderRadius: 2 },
      },
    ],
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
        <div className="h-[220px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          Aún no hay suficiente historia para detectar patrones
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: '220px', width: '100%' }} notMerge />
      )}
    </div>
  )
}
