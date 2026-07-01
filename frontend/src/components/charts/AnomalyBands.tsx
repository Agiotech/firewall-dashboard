import { useEffect, useState } from 'react'
import type { EChartsOption } from 'echarts'

import { BaseChart } from './BaseChart'
import { api } from '../../api/client'
import { colors } from '../../theme/colors'
import { formatBps } from '../../utils/format'

interface Props {
  wans: string[]
  labels: Record<string, string>
}

export function AnomalyBands({ wans, labels }: Props) {
  const [wan, setWan] = useState<string>(wans[0] ?? '')
  const [data, setData] = useState<any[]>([])
  const [weeks, setWeeks] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (wans.length > 0 && !wan) setWan(wans[0])
  }, [wans, wan])

  useEffect(() => {
    if (!wan) return
    let cancelled = false
    setLoading(true)
    api.anomalyWan(wan, '24h', 4).then((r) => {
      if (!cancelled) { setData(r.data); setWeeks(r.weeks); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [wan])

  const option: EChartsOption = {
    title: { text: `Bandas de anomalía — ${labels[wan] ?? wan}`, left: 0, textStyle: { fontSize: 14 } },
    legend: { top: 0, right: 60, itemWidth: 10, itemHeight: 10 },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', axisLabel: { fontSize: 9, formatter: (v: number) => formatBps(v).replace(' ', '') } },
    tooltip: { trigger: 'axis', valueFormatter: (v) => formatBps(v as number) },
    series: [
      {
        name: 'Banda p5-p95',
        type: 'line',
        stack: 'band',
        showSymbol: false,
        lineStyle: { opacity: 0 },
        data: data.map((p) => [p.ts * 1000, p.p5]),
        silent: true,
      },
      {
        name: `Histórico ${weeks}w (rango)`,
        type: 'line',
        stack: 'band',
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { color: colors.chartCyan, opacity: 0.18 },
        data: data.map((p) => [p.ts * 1000, Math.max(0, p.p95 - p.p5)]),
      },
      {
        name: 'Mediana histórica',
        type: 'line',
        smooth: true, showSymbol: false,
        lineStyle: { width: 1, color: colors.chartIndigo, type: 'dashed' },
        data: data.map((p) => [p.ts * 1000, p.median]),
      },
      {
        name: 'Actual',
        type: 'line',
        smooth: true, showSymbol: false,
        lineStyle: { width: 2.5, color: colors.chartRed },
        data: data.map((p) => [p.ts * 1000, p.actual]),
      },
    ],
  }

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <p
          className="text-[12px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          Detección de anomalías
        </p>
        <div className="flex items-center gap-1 bg-[#eef4f8] dark:bg-[#252c2f] rounded-[8px] p-0.5">
          {wans.map((w) => (
            <button
              key={w}
              onClick={() => setWan(w)}
              className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-[6px] ${
                wan === w
                  ? 'bg-white dark:bg-[#1e2528] text-[#161c1f] dark:text-[#ecf2f6]'
                  : 'text-[#4d5e85] dark:text-[#a8c4cc]'
              }`}
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {labels[w] ?? w}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="h-[260px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">Cargando...</div>
      ) : data.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8">
          Sin historia suficiente. Necesita 1+ semana de datos para construir bandas.
        </div>
      ) : (
        <BaseChart option={option} height={260} noZoom />
      )}
    </div>
  )
}
