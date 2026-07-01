import { useEffect, useMemo, useState } from 'react'

import { api } from '../../api/client'
import { useThemeStore } from '../../stores/themeStore'
import { formatBytes } from '../../utils/format'
import { WanHourDayMatrix } from './WanHourDayMatrix'

type ConsumptionCell = {
  dow: number
  hour: number
  bytes_in: number
  bytes_out: number
  bytes_total: number
}

const RANGES = ['1h', '6h', '24h', '7d', '15d', '30d'] as const
type Range = (typeof RANGES)[number]

interface Props {
  wans: string[]
  labels: Record<string, string>
  range?: Range
}

export function WANConsumptionGroup({ wans, labels, range: initial = '30d' }: Props) {
  const [range, setRange] = useState<Range>(initial)
  const [allData, setAllData] = useState<Record<string, ConsumptionCell[]>>({})
  const [loading, setLoading] = useState(true)
  const isDark = useThemeStore((s) => s.isDark)

  useEffect(() => {
    if (wans.length === 0) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    async function load() {
      const next: Record<string, ConsumptionCell[]> = {}
      await Promise.all(
        wans.map(async (w) => {
          try {
            const r = await api.heatmapWanConsumption(w, range)
            next[w] = r.data
          } catch {
            next[w] = []
          }
        }),
      )
      if (!cancelled) {
        setAllData(next)
        setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 300_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [wans.join(','), range])

  const globalMax = useMemo(() => {
    const all: ConsumptionCell[] = []
    Object.values(allData).forEach((arr) => all.push(...arr))
    if (all.length === 0) return 1
    return Math.max(1, ...all.map((c) => c.bytes_total))
  }, [allData])

  const totals = useMemo(() => {
    return wans.map((w) => ({
      wan: w,
      label: labels[w] ?? w,
      total: (allData[w] ?? []).reduce((s, c) => s + c.bytes_total, 0),
    })).sort((a, b) => b.total - a.total)
  }, [wans, allData, labels])

  const grandTotal = totals.reduce((s, t) => s + t.total, 0)

  const gradientStops = isDark
    ? ['#1e2528', '#006876', '#00b6cc', '#FFA726', '#EF5350']
    : ['#eef4f8', '#006876', '#00b6cc', '#FFA726', '#EF5350']
  const stopPcts = [0, 25, 50, 75, 100]
  const ticks = stopPcts.map((p) => formatBytes((globalMax * p) / 100))

  return (
    <div className="space-y-3">
      {/* Header con leyenda + selector + top consumidor */}
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[10px] px-4 py-3 flex flex-wrap items-center gap-4"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        <span
          className="text-[10px] uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          Escala compartida (bytes celda)
        </span>
        <div className="flex-1 min-w-[200px] max-w-[420px]">
          <div
            className="h-2 rounded"
            style={{ background: `linear-gradient(to right, ${gradientStops.join(', ')})` }}
          />
          <div className="flex justify-between mt-1">
            {ticks.map((t, i) => (
              <span
                key={i}
                className="text-[9px] text-[#4d5e85] dark:text-[#a8c4cc]"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-1 ml-auto">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-[0.06em] transition-colors ${
                range === r
                  ? 'bg-[#006876] text-white'
                  : 'bg-[#eef4f8] dark:bg-[#252c2f] text-[#4d5e85] dark:text-[#a8c4cc] hover:bg-[#dde3e7] dark:hover:bg-[#2b3134]'
              }`}
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Totales por WAN — para responder "quién consumió más" de un vistazo */}
      {grandTotal > 0 && (
        <div
          className="bg-white dark:bg-[#1e2528] rounded-[10px] px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2"
          style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
        >
          <span
            className="text-[10px] uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Total por WAN ({range})
          </span>
          {totals.map((t, idx) => {
            const pct = grandTotal > 0 ? (t.total / grandTotal) * 100 : 0
            return (
              <div key={t.wan} className="flex items-center gap-1.5">
                <span
                  className="text-[10px] font-bold"
                  style={{
                    color: idx === 0 ? '#EF5350' : '#161c1f',
                    fontFamily: 'Space Grotesk, sans-serif',
                  }}
                >
                  {t.label}
                </span>
                <span
                  className="text-[10px]"
                  style={{
                    color: '#4d5e85',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {formatBytes(t.total)} ({pct.toFixed(0)}%)
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {wans.map((w) => {
          const cells = (allData[w] ?? []).map((c) => ({ dow: c.dow, hour: c.hour, value: c.bytes_total }))
          return (
            <WanHourDayMatrix
              key={w}
              wan={w}
              label={labels[w]}
              range={range}
              data={cells}
              loading={loading}
              globalMax={globalMax}
              formatValue={formatBytes}
              titlePrefix="Consumo (total)"
            />
          )
        })}
      </div>
    </div>
  )
}
