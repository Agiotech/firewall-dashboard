import { useEffect, useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import { Eye, EyeOff } from 'lucide-react'

import { BaseChart } from './BaseChart'
import { api } from '../../api/client'
import { colors } from '../../theme/colors'

interface Uptime {
  tunnel: string
  uptime_pct: number
  state: string | null
  peer_ip: string | null
}

const RANGES = [
  { v: '24h', label: '24h' },
  { v: '7d', label: '7d' },
  { v: '30d', label: '30d' },
] as const

function shortLabel(name: string): string {
  return name.replace('VPN-', '').replace('GDL-', '')
}

function colorFor(pct: number): string {
  if (pct >= 99) return colors.chartGreen
  if (pct >= 90) return colors.chartAmber
  return colors.chartRed
}

export function VpnUptimeGauges() {
  const [range, setRange] = useState<typeof RANGES[number]['v']>('24h')
  const [data, setData] = useState<Uptime[]>([])
  const [loading, setLoading] = useState(true)
  const [showArtifacts, setShowArtifacts] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.vpnUptime(range).then((r) => {
      if (!cancelled) { setData(r.data); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range])

  const { filtered, artifactCount } = useMemo(() => {
    const main = data.filter((t) => !t.tunnel.endsWith('_sp1'))
    const artifacts = data.filter((t) => t.tunnel.endsWith('_sp1'))
    const visible = showArtifacts ? [...main, ...artifacts] : main
    const sorted = [...visible].sort((a, b) => b.uptime_pct - a.uptime_pct)
    return { filtered: sorted, artifactCount: artifacts.length }
  }, [data, showArtifacts])

  const labels = filtered.map((t) => shortLabel(t.tunnel))
  const values = filtered.map((t) => Math.round(t.uptime_pct * 10) / 10)
  const barColors = filtered.map((t) => colorFor(t.uptime_pct))

  const option: EChartsOption = {
    grid: { top: 16, right: 60, bottom: 16, left: 12, containLabel: true },
    xAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { fontSize: 10, formatter: '{value}%' },
      splitLine: { show: true, lineStyle: { color: '#e9eff3', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: labels,
      inverse: true,
      axisLabel: { fontSize: 10, fontWeight: 500 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(30,37,40,0.95)',
      borderWidth: 0,
      padding: 10,
      textStyle: { color: '#ecf2f6', fontSize: 11 },
      formatter: (params: any) => {
        const idx = params.dataIndex as number
        const t = filtered[idx]
        if (!t) return ''
        const c = colorFor(t.uptime_pct)
        const peer = t.peer_ip ? `<div style="opacity:0.7;font-size:10px;margin-top:6px">PEER</div>` +
          `<div style="font-family:JetBrains Mono,monospace">${t.peer_ip}</div>` : ''
        const state = t.state ? `<div style="opacity:0.7;font-size:10px;margin-top:6px">ESTADO</div>` +
          `<div style="font-family:JetBrains Mono,monospace">${t.state}</div>` : ''
        return (
          `<div style="font-family:Space Grotesk,sans-serif">` +
          `<div style="font-weight:bold;margin-bottom:6px">${shortLabel(t.tunnel)}</div>` +
          `<div style="opacity:0.7;font-size:10px">UPTIME</div>` +
          `<div style="color:${c};font-weight:bold;font-size:14px">${t.uptime_pct.toFixed(2)}%</div>` +
          state + peer +
          `</div>`
        )
      },
    },
    series: [
      {
        type: 'bar',
        data: values.map((v, i) => ({
          value: v,
          itemStyle: { color: barColors[i], borderRadius: [0, 4, 4, 0] },
        })),
        barMaxWidth: 18,
        label: {
          show: true,
          position: 'right',
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 'bold',
          formatter: (p: any) => `${(p.value as number).toFixed(1)}%`,
          color: '#161c1f',
        },
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: { color: colors.chartGreen, type: 'dashed', opacity: 0.4, width: 1 },
          label: { show: false },
          data: [{ xAxis: 99 }],
        },
      },
    ],
  }

  const height = Math.max(160, filtered.length * 26 + 40)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p
            className="text-[12px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Uptime por túnel
          </p>
          {artifactCount > 0 && (
            <button
              onClick={() => setShowArtifacts((v) => !v)}
              className="flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] px-2 py-1 rounded-md transition-colors bg-[#eef4f8] dark:bg-[#252c2f] text-[#4d5e85] dark:text-[#a8c4cc] hover:bg-[#dde3e7] dark:hover:bg-[#2b3134]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              title="Los túneles _sp1 son artefactos del parser (peer/local invertidos)"
            >
              {showArtifacts ? <EyeOff size={11} /> : <Eye size={11} />}
              {showArtifacts ? 'Ocultar' : 'Ver'} _sp1 ({artifactCount})
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-[#eef4f8] dark:bg-[#252c2f] rounded-[8px] p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.v}
              onClick={() => setRange(r.v)}
              className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-[6px] ${
                range === r.v
                  ? 'bg-white dark:bg-[#1e2528] text-[#161c1f] dark:text-[#ecf2f6]'
                  : 'text-[#4d5e85] dark:text-[#a8c4cc]'
              }`}
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        {loading ? (
          <div className="h-[160px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
            Cargando...
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-[160px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8">
            Sin túneles registrados aún.
          </div>
        ) : (
          <BaseChart option={option} height={height} noZoom />
        )}
      </div>
    </div>
  )
}
