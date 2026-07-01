import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

import { api } from '../../api/client'
import { CHART_COLORS } from '../../theme/echarts-agiotech'

export function VendorDonut() {
  const [data, setData] = useState<{ vendor: string; n: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.vendorDistribution().then((r) => {
      if (!cancelled) { setData(r.data); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
  }, [])

  const top = data.slice(0, 12)
  const totalKnown = top.reduce((s, d) => s + d.n, 0)
  const others = data.slice(12).reduce((s, d) => s + d.n, 0)
  const slices = others > 0 ? [...top, { vendor: 'Otros', n: others }] : top

  const option: EChartsOption = {
    title: { text: `Distribución por vendor (${totalKnown + others} dispositivos)`, left: 0, textStyle: { fontSize: 13 } },
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { type: 'scroll', bottom: 4, itemWidth: 10, itemHeight: 10 },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        label: { show: true, formatter: '{b}\n{c}', fontSize: 10 },
        labelLine: { length: 6, length2: 8 },
        data: slices.map((d, i) => ({
          name: d.vendor,
          value: d.n,
          itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] },
        })),
      },
    ],
  }

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      {loading ? (
        <div className="h-[320px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">Cargando...</div>
      ) : data.length === 0 ? (
        <div className="h-[320px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">Sin dispositivos detectados</div>
      ) : (
        <ReactECharts option={option} style={{ height: '320px', width: '100%' }} notMerge />
      )}
    </div>
  )
}
