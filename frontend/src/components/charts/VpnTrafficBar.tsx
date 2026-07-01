import { useEffect, useState } from 'react'
import type { EChartsOption } from 'echarts'
import { AlertCircle } from 'lucide-react'

import { BaseChart } from './BaseChart'
import { api } from '../../api/client'
import { colors } from '../../theme/colors'
import { formatBytes } from '../../utils/format'

type Row = {
  tunnel: string
  peer_ip: string | null
  remote_subnet: string | null
  configured: boolean
  bytes_in: number
  bytes_out: number
  bytes_total: number
  state: string | null
}

export function VpnTrafficBar({ range = '24h' }: { range?: string }) {
  const [data, setData] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.vpnTraffic(range).then((r) => {
      if (!cancelled) { setData(r.data); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    const id = setInterval(() => {
      api.vpnTraffic(range).then((r) => !cancelled && setData(r.data)).catch(() => {})
    }, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [range])

  const configured = data.filter((r) => r.configured)
  const unconfigured = data.filter((r) => !r.configured)
  const sorted = [...configured].sort((a, b) => b.bytes_total - a.bytes_total)
  const names = sorted.map((r) => r.tunnel.replace('VPN-', '').replace('GDL-', ''))

  const option: EChartsOption = {
    title: { text: `Tráfico por túnel (${range})`, left: 0 },
    grid: { top: 36, right: 80, bottom: 30, left: 20, containLabel: true },
    legend: { top: 0, right: 20, itemWidth: 10, itemHeight: 10 },
    xAxis: { type: 'value', axisLabel: { fontSize: 9, formatter: (v: number) => formatBytes(v) } },
    yAxis: { type: 'category', data: names, inverse: true, axisLabel: { fontSize: 10 } },
    tooltip: { trigger: 'axis', valueFormatter: (v) => formatBytes(v as number) },
    series: [
      {
        name: '↓ in', type: 'bar', stack: 'total',
        itemStyle: { color: colors.chartGreen, borderRadius: [0, 0, 0, 0] },
        data: sorted.map((r) => r.bytes_in),
      },
      {
        name: '↑ out', type: 'bar', stack: 'total',
        itemStyle: { color: colors.chartAmber, borderRadius: [0, 4, 4, 0] },
        data: sorted.map((r) => r.bytes_out),
      },
    ],
  }

  const allUnconfigured = data.length > 0 && configured.length === 0
  const someUnconfigured = unconfigured.length > 0 && configured.length > 0
  const hasTraffic = sorted.some((r) => r.bytes_total > 0)

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      {loading ? (
        <div className="h-[200px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">Cargando...</div>
      ) : data.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8">
          Sin túneles registrados.
        </div>
      ) : allUnconfigured ? (
        <UnconfiguredBanner tunnels={unconfigured} title="Tráfico por túnel" />
      ) : (
        <>
          <BaseChart option={option} height={Math.max(220, names.length * 28 + 80)} noZoom />
          {!hasTraffic && (
            <p className="mt-2 text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] text-center">
              Túneles configurados pero sin tráfico en este rango.
            </p>
          )}
          {someUnconfigured && (
            <details className="mt-3">
              <summary
                className="text-[10px] uppercase tracking-[0.08em] cursor-pointer text-[#4d5e85] dark:text-[#a8c4cc] flex items-center gap-1.5"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                <AlertCircle size={12} style={{ color: colors.chartAmber }} />
                {unconfigured.length} túnel{unconfigured.length !== 1 ? 'es' : ''} sin subnet remota configurada
              </summary>
              <ul className="mt-2 space-y-1 text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] pl-4">
                {unconfigured.map((t) => (
                  <li key={t.tunnel} className="font-mono">{t.tunnel}</li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] pl-4 leading-relaxed">
                Agrega su CIDR remoto al mapa <code className="font-mono">VPN_REMOTE_SUBNETS</code> en <code className="font-mono">backend/.env</code> y reinicia.
              </p>
            </details>
          )}
        </>
      )}
    </div>
  )
}

function UnconfiguredBanner({ tunnels, title }: { tunnels: Row[]; title: string }) {
  return (
    <div>
      <p
        className="text-[14px] font-bold text-[#161c1f] dark:text-[#ecf2f6] mb-3"
        style={{ fontFamily: 'Space Grotesk, sans-serif' }}
      >
        {title}
      </p>
      <div
        className="rounded-[10px] p-4"
        style={{ backgroundColor: colors.chartAmber + '14', border: `1px solid ${colors.chartAmber}33` }}
      >
        <div className="flex items-start gap-2 mb-3">
          <AlertCircle size={16} style={{ color: colors.chartAmber, flexShrink: 0, marginTop: 2 }} />
          <div>
            <p
              className="text-[12px] font-bold text-[#161c1f] dark:text-[#ecf2f6]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Mapa de subnets remotas sin configurar
            </p>
            <p className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] mt-1 leading-relaxed">
              Los flujos en <code className="font-mono">flow_aggregates</code> usan IPs internas (192.168.x), no las IPs WAN de los peers. Para asociar bytes a cada túnel necesitas mapear el nombre del túnel a su CIDR remoto.
            </p>
          </div>
        </div>
        <p className="text-[10px] uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc] mb-1">
          Túneles detectados ({tunnels.length})
        </p>
        <ul className="text-[10px] font-mono text-[#4d5e85] dark:text-[#a8c4cc] space-y-0.5 max-h-[160px] overflow-y-auto">
          {tunnels.map((t) => <li key={t.tunnel}>{t.tunnel}</li>)}
        </ul>
        <p className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] mt-3 leading-relaxed">
          Edita <code className="font-mono">backend/.env</code>:
        </p>
        <pre
          className="mt-1 p-2 rounded text-[9px] overflow-x-auto"
          style={{ backgroundColor: '#1e252833', fontFamily: 'JetBrains Mono, monospace' }}
        >
{`VPN_REMOTE_SUBNETS={"${tunnels[0]?.tunnel}":"192.168.X.0/24",...}`}
        </pre>
      </div>
    </div>
  )
}
