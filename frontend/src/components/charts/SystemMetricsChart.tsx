import { useEffect, useState } from 'react'
import type { EChartsOption } from 'echarts'

import { BaseChart } from './BaseChart'
import { colors } from '../../theme/colors'
import { api } from '../../api/client'

interface Props {
  range?: string
}

interface SysPoint {
  ts: number
  cpu_pct: number | null
  mem_pct: number | null
  sessions: number | null
}

export function SystemMetricsChart({ range = '1h' }: Props) {
  const [data, setData] = useState<SysPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await api.systemSeries(range)
        if (!cancelled) {
          setData(r.data)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [range])

  const option: EChartsOption = {
    title: { text: 'Salud del firewall', left: 0 },
    legend: { top: 0, right: 60 },
    xAxis: { type: 'time', axisLabel: { fontSize: 9 } },
    yAxis: [
      {
        type: 'value',
        name: '%',
        position: 'left',
        axisLabel: { fontSize: 9, formatter: '{value}%' },
        min: 0,
        max: 100,
      },
      {
        type: 'value',
        name: 'Sesiones',
        position: 'right',
        axisLabel: { fontSize: 9 },
        min: 0,
        splitLine: { show: false },
      },
    ],
    tooltip: { trigger: 'axis' },
    series: [
      {
        name: 'CPU %',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: colors.chartTeal },
        areaStyle: { color: colors.chartTeal, opacity: 0.08 },
        yAxisIndex: 0,
        data: data.map((p) => [p.ts * 1000, p.cpu_pct ?? 0]),
      },
      {
        name: 'MEM %',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: colors.chartIndigo },
        yAxisIndex: 0,
        data: data.map((p) => [p.ts * 1000, p.mem_pct ?? 0]),
      },
      {
        name: 'Sesiones',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: colors.chartAmber, type: 'dashed' },
        yAxisIndex: 1,
        data: data.map((p) => [p.ts * 1000, p.sessions ?? 0]),
      },
    ],
  }

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      {loading ? (
        <div className="h-[280px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          Cargando…
        </div>
      ) : (
        <BaseChart option={option} height={280} />
      )}
    </div>
  )
}
