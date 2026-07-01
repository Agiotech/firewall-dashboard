import { useEffect, useState } from 'react'
import type { EChartsOption } from 'echarts'

import { BaseChart } from './BaseChart'
import { CHART_COLORS } from '../../theme/echarts-agiotech'
import { api } from '../../api/client'
import { formatBps } from '../../utils/format'

interface Props {
  wans: string[]
  labels: Record<string, string>
  range?: string
}

interface SeriesPoint {
  ts: number
  bps_in: number
  bps_out: number
  oper_status: number
}

export function WANTrafficChart({ wans, labels, range = '1h' }: Props) {
  const [data, setData] = useState<Record<string, SeriesPoint[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const next: Record<string, SeriesPoint[]> = {}
      await Promise.all(
        wans.map(async (w) => {
          try {
            const r = await api.wanMetrics(w, range)
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
    const id = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [wans.join(','), range])

  const series: EChartsOption['series'] = []
  wans.forEach((w, i) => {
    const color = CHART_COLORS[i % CHART_COLORS.length]
    const points = data[w] ?? []
    series.push({
      name: `${labels[w] ?? w} ↓`,
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2, color },
      areaStyle: { color, opacity: 0.06 },
      data: points.map((p) => [p.ts * 1000, p.bps_in]),
    })
    series.push({
      name: `${labels[w] ?? w} ↑`,
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 1.5, color, type: 'dashed' },
      data: points.map((p) => [p.ts * 1000, p.bps_out]),
    })
  })

  const option: EChartsOption = {
    title: { text: 'Tráfico WAN — Mbps', left: 0 },
    legend: { top: 0, right: 60 },
    xAxis: {
      type: 'time',
      axisLabel: { fontSize: 9 },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontSize: 9,
        formatter: (v: number) => formatBps(v).replace(' ', ''),
      },
    },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v) => formatBps(v as number),
    },
    series,
  }

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      {loading && Object.keys(data).length === 0 ? (
        <div className="h-[280px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          Cargando…
        </div>
      ) : (
        <BaseChart option={option} height={280} />
      )}
    </div>
  )
}
