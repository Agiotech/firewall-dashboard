import { useEffect, useState } from 'react'
import type { EChartsOption } from 'echarts'
import { X, Activity, Download, Upload } from 'lucide-react'

import { BaseChart } from '../charts/BaseChart'
import { api } from '../../api/client'
import { colors } from '../../theme/colors'
import { formatBytes, formatBps } from '../../utils/format'

interface Props {
  ip: string | null
  onClose: () => void
}

export function DeviceDetailModal({ ip, onClose }: Props) {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('24h')

  useEffect(() => {
    if (!ip) return
    let cancelled = false
    setLoading(true)
    api.deviceDetail(ip, range).then((r) => {
      if (!cancelled) {
        setData(r)
        setLoading(false)
      }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ip, range])

  if (!ip) return null

  const trafficOption: EChartsOption | null = data?.traffic.length ? {
    grid: { top: 30, right: 16, bottom: 30, left: 50 },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', axisLabel: { fontSize: 9, formatter: (v: number) => formatBps(v).replace(' ', '') } },
    tooltip: { trigger: 'axis', valueFormatter: (v) => formatBps(v as number) },
    legend: { top: 0, right: 10, itemWidth: 10, itemHeight: 10 },
    series: [
      {
        name: '↓ Bajada', type: 'line', smooth: true, showSymbol: false,
        lineStyle: { width: 2, color: colors.chartGreen },
        areaStyle: { color: colors.chartGreen, opacity: 0.08 },
        data: data.traffic.map((p: any) => [p.ts * 1000, p.bps_in]),
      },
      {
        name: '↑ Subida', type: 'line', smooth: true, showSymbol: false,
        lineStyle: { width: 2, color: colors.chartAmber },
        data: data.traffic.map((p: any) => [p.ts * 1000, p.bps_out]),
      },
    ],
  } : null

  const ranges = ['6h', '24h', '7d']

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[14px] w-full max-w-[1000px] max-h-[90vh] overflow-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.28)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eff3] dark:border-[#252c2f] sticky top-0 bg-white dark:bg-[#1e2528] z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-[10px] flex items-center justify-center" style={{ backgroundColor: colors.chartCyan + '1a' }}>
              <Activity size={18} style={{ color: colors.chartCyan }} strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <p
                className="text-[16px] font-bold text-[#161c1f] dark:text-[#ecf2f6]"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              >
                {ip}
              </p>
              <p className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] truncate" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {data?.device?.hostname && <span className="font-bold">{data.device.hostname}</span>}
                {data?.device?.dhcp_description && <span> · {data.device.dhcp_description}</span>}
                {data?.device?.vendor && <span> · {data.device.vendor}</span>}
                {data?.device?.mac && <span className="ml-2 font-mono text-[10px]">{data.device.mac}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[#eef4f8] dark:bg-[#252c2f] rounded-[8px] p-0.5">
              {ranges.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-[6px] ${
                    range === r
                      ? 'bg-white dark:bg-[#1e2528] text-[#161c1f] dark:text-[#ecf2f6]'
                      : 'text-[#4d5e85] dark:text-[#a8c4cc]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="rounded-full p-1 hover:bg-[#eef4f8] dark:hover:bg-[#252c2f]">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {loading ? (
            <p className="text-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] py-12">Cargando detalle...</p>
          ) : (
            <>
              <section>
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc] mb-2"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  Tráfico en {range}
                </p>
                {trafficOption ? <BaseChart option={trafficOption} height={240} noZoom /> : (
                  <p className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] py-4 text-center">
                    Sin tráfico registrado en este rango.
                  </p>
                )}
              </section>

              <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TopList title="↑ Destinos más usados" icon={Upload} color={colors.chartAmber}
                  items={(data?.top_destinations?.top_dst ?? []).map((r: any) => ({
                    label: r.peer, value: formatBytes(r.bytes_out),
                  }))} />
                <TopList title="↓ Recibido desde" icon={Download} color={colors.chartGreen}
                  items={(data?.top_destinations?.top_src ?? []).map((r: any) => ({
                    label: r.peer, value: formatBytes(r.bytes_in),
                  }))} />
                <TopList title="Puertos destino más vistos" icon={Activity} color={colors.chartCyan}
                  items={(data?.top_destinations?.top_ports ?? []).map((r: any) => ({
                    label: `${r.dst_port}`, value: `${r.n} hits`,
                  }))} />
              </section>

              <section>
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc] mb-2"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  Eventos recientes
                </p>
                {(!data?.events || data.events.length === 0) ? (
                  <p className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] py-4 text-center">
                    Sin eventos recientes para esta IP.
                  </p>
                ) : (
                  <div className="max-h-[260px] overflow-auto">
                    <table className="w-full text-[10px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      <tbody>
                        {data.events.map((e: any) => (
                          <tr key={e.id} className="border-b border-[#e9eff3] dark:border-[#252c2f]">
                            <td className="py-1 px-2 text-[#4d5e85] dark:text-[#a8c4cc]">
                              {new Date(e.ts * 1000).toLocaleTimeString('es-MX')}
                            </td>
                            <td className="py-1 px-2 text-[#3c494c] dark:text-[#c0d4da]">{e.priority}</td>
                            <td className="py-1 px-2 text-[#161c1f] dark:text-[#ecf2f6]">{e.category}</td>
                            <td className="py-1 px-2 text-[#3c494c] dark:text-[#c0d4da] truncate max-w-[400px]">
                              {e.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function TopList({
  title, icon: Icon, color, items,
}: {
  title: string
  icon: any
  color: string
  items: { label: string; value: string }[]
}) {
  return (
    <div
      className="bg-[#f4fafe] dark:bg-[#252c2f] rounded-[10px] p-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={12} style={{ color }} strokeWidth={2} />
        <p
          className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#161c1f] dark:text-[#ecf2f6]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          {title}
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc]">Sin datos</p>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, 8).map((it, i) => (
            <li key={`${it.label}-${i}`} className="flex items-center justify-between text-[10px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <span className="text-[#161c1f] dark:text-[#ecf2f6] truncate">{it.label}</span>
              <span className="text-[#4d5e85] dark:text-[#a8c4cc] flex-shrink-0 ml-2">{it.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
