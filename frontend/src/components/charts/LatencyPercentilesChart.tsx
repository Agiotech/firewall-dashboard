import { useEffect, useState } from 'react'
import type { EChartsOption } from 'echarts'

import { BaseChart } from './BaseChart'
import { CHART_COLORS } from '../../theme/echarts-agiotech'
import { api } from '../../api/client'

interface Props {
  range?: string
}

interface QualityPoint {
  ts: number
  target: string
  latency_ms: number
  jitter_ms: number
  loss_pct: number
}

export function LatencyPercentilesChart({ range = '1h' }: Props) {
  const [series, setSeries] = useState<Record<string, QualityPoint[]>>({})
  const [percentiles, setPercentiles] = useState<Record<string, { p50: number; p90: number; p99: number; loss_avg: number; samples: number }>>({})
  const [loading, setLoading] = useState(true)
  const [targets, setTargets] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await api.qualitySeries(undefined, range)
        if (cancelled) return
        const byTarget: Record<string, QualityPoint[]> = {}
        for (const p of r.data) {
          ;(byTarget[p.target] ??= []).push(p)
        }
        setSeries(byTarget)
        setTargets(r.targets)

        const pcts: Record<string, { p50: number; p90: number; p99: number; loss_avg: number; samples: number }> = {}
        await Promise.all(
          r.targets.map(async (t: string) => {
            try {
              const p = await api.qualityPercentiles(t, range)
              pcts[t] = {
                p50: p.p50, p90: p.p90, p99: p.p99, loss_avg: p.loss_avg, samples: p.samples,
              }
            } catch {
              /* ignore */
            }
          }),
        )
        if (!cancelled) {
          setPercentiles(pcts)
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

  const echartsSeries: EChartsOption['series'] = []
  targets.forEach((t, i) => {
    const color = CHART_COLORS[i % CHART_COLORS.length]
    const pts = series[t] ?? []
    echartsSeries.push({
      name: t,
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2, color },
      data: pts.map((p) => [p.ts * 1000, p.latency_ms]),
    })
  })

  const option: EChartsOption = {
    title: { text: 'Latencia a destinos externos (ms)', left: 0 },
    legend: { top: 0, right: 60 },
    xAxis: { type: 'time', axisLabel: { fontSize: 9 } },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 9, formatter: '{value} ms' },
      min: 0,
    },
    tooltip: { trigger: 'axis', valueFormatter: (v) => `${(v as number).toFixed(1)} ms` },
    series: echartsSeries,
  }

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      {loading && targets.length === 0 ? (
        <div className="h-[280px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          Cargando…
        </div>
      ) : targets.length === 0 ? (
        <div className="h-[280px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          Sin probes activos. Verifica QUALITY_CHECK_ENABLED.
        </div>
      ) : (
        <>
          <BaseChart option={option} height={260} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-[#e9eff3] dark:border-[#252c2f]">
            {targets.map((t) => {
              const p = percentiles[t]
              if (!p) return null
              return (
                <div key={t} className="text-[11px]">
                  <p
                    className="font-bold text-[#4d5e85] dark:text-[#a8c4cc] uppercase tracking-[0.08em] mb-1"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    {t}
                  </p>
                  <p className="text-[#161c1f] dark:text-[#ecf2f6] font-mono">
                    p50 {p.p50.toFixed(1)}ms · p90 {p.p90.toFixed(1)}ms · p99 {p.p99.toFixed(1)}ms
                  </p>
                  <p className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] mt-0.5">
                    Loss {p.loss_avg.toFixed(1)}% · {p.samples} muestras
                  </p>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
