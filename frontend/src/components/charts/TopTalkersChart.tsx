import { useEffect, useState } from 'react'
import type { EChartsOption } from 'echarts'

import { BaseChart } from './BaseChart'
import { colors } from '../../theme/colors'
import { api } from '../../api/client'

interface Props {
  range?: string
}

interface TalkerRow {
  src_ip?: string
  dst_ip?: string
  dst_port?: number
  n: number
}

interface TopResponse {
  top_src: TalkerRow[]
  top_dst: TalkerRow[]
  top_dst_port: TalkerRow[]
}

function buildBar(title: string, items: { label: string; value: number }[], color: string): EChartsOption {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  return {
    title: { text: title, left: 0 },
    grid: { top: 36, right: 60, bottom: 10, left: 20, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: sorted.map((d) => d.label),
      axisLabel: { fontSize: 10 },
      inverse: true,
    },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    series: [
      {
        type: 'bar',
        barMaxWidth: 18,
        data: sorted.map((d) => ({
          value: d.value,
          itemStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: colors.chartBlue },
                { offset: 1, color },
              ],
            },
            borderRadius: [0, 4, 4, 0],
          },
          label: { show: true, position: 'right', fontSize: 10 },
        })),
      },
    ],
  }
}

export function TopTalkersChart({ range = '1h' }: Props) {
  const [data, setData] = useState<TopResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await api.topTalkers(range, 10)
        if (!cancelled) {
          setData(r)
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

  if (loading) {
    return (
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 h-[300px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        Cargando…
      </div>
    )
  }

  const hasAny =
    (data?.top_src?.length ?? 0) +
      (data?.top_dst?.length ?? 0) +
      (data?.top_dst_port?.length ?? 0) >
    0
  if (!hasAny) {
    return (
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 h-[200px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        Sin eventos para calcular top talkers en {range}. Habilita syslog del firewall.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        <BaseChart
          option={buildBar(
            'Top IPs origen (eventos)',
            (data?.top_src ?? []).map((r) => ({ label: r.src_ip ?? '', value: r.n })),
            colors.chartCyan,
          )}
          height={Math.max(220, (data?.top_src?.length ?? 0) * 28 + 60)}
          noZoom
        />
      </div>
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        <BaseChart
          option={buildBar(
            'Top IPs destino (eventos)',
            (data?.top_dst ?? []).map((r) => ({ label: r.dst_ip ?? '', value: r.n })),
            colors.chartTeal,
          )}
          height={Math.max(220, (data?.top_dst?.length ?? 0) * 28 + 60)}
          noZoom
        />
      </div>
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        <BaseChart
          option={buildBar(
            'Top puertos destino',
            (data?.top_dst_port ?? []).map((r) => ({ label: String(r.dst_port), value: r.n })),
            colors.chartAmber,
          )}
          height={Math.max(220, (data?.top_dst_port?.length ?? 0) * 28 + 60)}
          noZoom
        />
      </div>
    </div>
  )
}
