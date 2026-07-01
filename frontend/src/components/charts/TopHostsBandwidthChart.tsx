import { useEffect, useState } from 'react'
import type { EChartsOption } from 'echarts'
import { Download, Upload, Globe2 } from 'lucide-react'

import { BaseChart } from './BaseChart'
import { colors } from '../../theme/colors'
import { api } from '../../api/client'
import { formatBytes } from '../../utils/format'

interface Props {
  range?: string
  limit?: number
}

interface TopRow {
  host: string
  total_bytes: number
  total_packets: number
}

interface Panel {
  key: string
  title: string
  icon: typeof Download
  color: string
  data: TopRow[]
}

function buildBar(panel: Panel): EChartsOption {
  const sorted = [...panel.data].sort((a, b) => b.total_bytes - a.total_bytes)
  const total = sorted.reduce((s, d) => s + d.total_bytes, 0) || 1
  return {
    grid: { top: 8, right: 100, bottom: 4, left: 6, containLabel: true },
    xAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: {
      type: 'category',
      inverse: true,
      data: sorted.map((d) => d.host),
      axisLabel: { fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params
        const idx = p.dataIndex
        const r = sorted[idx]
        if (!r) return ''
        const pct = ((r.total_bytes / total) * 100).toFixed(1)
        return `<b>${r.host}</b><br/>${formatBytes(r.total_bytes)} (${pct}%)<br/>${r.total_packets.toLocaleString('es-MX')} pkts`
      },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 14,
        data: sorted.map((d) => ({
          value: d.total_bytes,
          itemStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: colors.chartBlue },
                { offset: 1, color: panel.color },
              ],
            },
            borderRadius: [0, 3, 3, 0],
          },
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            formatter: () => formatBytes(d.total_bytes),
          },
        })),
      },
    ],
  }
}

export function TopHostsBandwidthChart({ range = '1h', limit = 20 }: Props) {
  const [panels, setPanels] = useState<Panel[]>([])
  const [loading, setLoading] = useState(true)
  const [activeRange, setActiveRange] = useState(range)
  const [totals, setTotals] = useState<{ flows: number; bytes_: number; packets: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [lanDown, lanUp, extDown, extUp, t] = await Promise.all([
          api.topLanHosts('download', activeRange, limit),
          api.topLanHosts('upload', activeRange, limit),
          api.topExternalIps('download', activeRange, limit),
          api.topExternalIps('upload', activeRange, limit),
          api.flowTotals(activeRange),
        ])
        if (cancelled) return
        setPanels([
          { key: 'lan-down', title: `Top ${limit} equipos por BAJADA`, icon: Download, color: colors.chartGreen, data: lanDown.data },
          { key: 'lan-up', title: `Top ${limit} equipos por SUBIDA`, icon: Upload, color: colors.chartAmber, data: lanUp.data },
          { key: 'ext-down', title: `Top ${limit} IPs externas (origen — descargado de)`, icon: Globe2, color: colors.chartCyan, data: extDown.data },
          { key: 'ext-up', title: `Top ${limit} IPs externas (destino — enviado a)`, icon: Globe2, color: colors.chartPurple, data: extUp.data },
        ])
        setTotals(t.data)
        setLoading(false)
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
  }, [activeRange, limit])

  const ranges: { v: string; label: string }[] = [
    { v: '5m', label: '5m' },
    { v: '1h', label: '1h' },
    { v: '6h', label: '6h' },
    { v: '24h', label: '24h' },
    { v: '7d', label: '7d' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-[#eef4f8] dark:bg-[#252c2f] rounded-[10px] p-1">
          {ranges.map((r) => (
            <button
              key={r.v}
              onClick={() => setActiveRange(r.v)}
              className={`px-3 py-1.5 text-[11px] font-bold rounded-[8px] uppercase tracking-[0.08em] ${
                activeRange === r.v
                  ? 'bg-white dark:bg-[#1e2528] text-[#161c1f] dark:text-[#ecf2f6] shadow-sm'
                  : 'text-[#4d5e85] dark:text-[#a8c4cc]'
              }`}
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {r.label}
            </button>
          ))}
        </div>
        {totals && (
          <p
            className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Total ventana: <b className="text-[#161c1f] dark:text-[#ecf2f6]">{formatBytes(totals.bytes_ || 0)}</b>
            {' '}· {(totals.flows ?? 0).toLocaleString('es-MX')} flujos
          </p>
        )}
      </div>

      {loading && panels.length === 0 ? (
        <div
          className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 h-[200px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
        >
          Cargando…
        </div>
      ) : panels.every((p) => p.data.length === 0) ? (
        <div
          className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 h-[180px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8"
          style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
        >
          Sin datos de flujos. Activa NETFLOW_ENABLED y configura el USG para exportar NetFlow v9 al puerto del dashboard.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {panels.map((p) => {
            const Icon = p.icon
            const height = Math.max(180, p.data.length * 22 + 40)
            return (
              <div
                key={p.key}
                className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
                style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: p.color + '1a' }}
                  >
                    <Icon size={16} style={{ color: p.color }} strokeWidth={1.8} />
                  </div>
                  <p
                    className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#161c1f] dark:text-[#ecf2f6]"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    {p.title}
                  </p>
                </div>
                {p.data.length === 0 ? (
                  <div className="h-[160px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
                    Sin datos
                  </div>
                ) : (
                  <BaseChart option={buildBar(p)} height={height} noZoom />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
