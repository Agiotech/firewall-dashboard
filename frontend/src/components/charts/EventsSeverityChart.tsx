import { useEffect, useState } from 'react'
import type { EChartsOption } from 'echarts'

import { BaseChart } from './BaseChart'
import { colors } from '../../theme/colors'
import { api } from '../../api/client'

interface Props {
  range?: string
}

interface Row {
  bucket_ts: number
  priority: string
  n: number
}

const SEV_COLOR: Record<string, string> = {
  alert: colors.chartRed,
  critical: colors.chartRed,
  error: colors.chartRed,
  warning: colors.chartAmber,
  notice: colors.chartCyan,
  info: colors.chartIndigo,
  debug: colors.textGhost,
  monitor: colors.chartPurple,
}

const SEV_ORDER = ['alert', 'critical', 'error', 'warning', 'notice', 'info', 'monitor']

export function EventsSeverityChart({ range = '6h' }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [bucket, setBucket] = useState(60)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await api.eventsSeveritySeries(range)
        if (!cancelled) {
          setRows(r.data)
          setBucket(r.bucket_s)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [range])

  const buckets = Array.from(new Set(rows.map((r) => r.bucket_ts))).sort((a, b) => a - b)
  const priorities = Array.from(new Set(rows.map((r) => r.priority)))
  priorities.sort((a, b) => (SEV_ORDER.indexOf(a) + 99) - (SEV_ORDER.indexOf(b) + 99))

  const series: EChartsOption['series'] = priorities.map((p) => ({
    name: p,
    type: 'bar',
    stack: 'sev',
    barMaxWidth: 14,
    itemStyle: { color: SEV_COLOR[p] ?? colors.textGhost },
    data: buckets.map((b) => {
      const found = rows.find((r) => r.bucket_ts === b && r.priority === p)
      return [b * 1000, found ? found.n : 0]
    }),
  }))

  const option: EChartsOption = {
    title: { text: `Eventos por severidad (bucket ${bucket}s)`, left: 0 },
    legend: { top: 0, right: 60, itemWidth: 10, itemHeight: 10 },
    xAxis: { type: 'time', axisLabel: { fontSize: 9 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 9 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    series,
  }

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      {loading ? (
        <div className="h-[260px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          Cargando…
        </div>
      ) : buckets.length === 0 ? (
        <div className="h-[260px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          Sin eventos en este rango
        </div>
      ) : (
        <BaseChart option={option} height={260} />
      )}
    </div>
  )
}
