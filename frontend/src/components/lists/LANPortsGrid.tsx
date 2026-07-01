import { useEffect, useState } from 'react'
import { Cable, Network } from 'lucide-react'

import { api } from '../../api/client'
import { colors } from '../../theme/colors'
import { formatBps } from '../../utils/format'
import { LanPortTopHostsModal } from './LanPortTopHostsModal'

interface LanRow {
  port_name: string
  oper_status: number
  bps_in: number
  bps_out: number
  errors_in: number
  errors_out: number
  speed_mbps: number
}

type Level = 'green' | 'amber' | 'red'

const STATUS_COLORS: Record<Level, string> = {
  green: colors.chartGreen,
  amber: colors.chartAmber,
  red: colors.chartRed,
}

function utilizationPct(p: LanRow): number {
  const link = (p.speed_mbps || 1000) * 1_000_000
  if (link <= 0) return 0
  const used = Math.max(p.bps_in, p.bps_out)
  return Math.min(100, (used / link) * 100)
}

function utilLevel(util: number): Level {
  if (util >= 75) return 'red'
  if (util >= 40) return 'amber'
  return 'green'
}

function statusFromPort(p: LanRow): Level {
  if (p.oper_status === 0) return 'red'
  if (p.errors_in + p.errors_out > 5) return 'amber'
  return utilLevel(utilizationPct(p))
}

function TrafficLight({ level }: { level: Level }) {
  const order: Level[] = ['red', 'amber', 'green']
  return (
    <div className="flex flex-col gap-1">
      {order.map((l) => (
        <span
          key={l}
          className={`block w-2.5 h-2.5 rounded-full ${l === level ? '' : ''}`}
          style={{
            backgroundColor: STATUS_COLORS[l],
            opacity: l === level ? 1 : 0.18,
            boxShadow: l === level ? `0 0 6px ${STATUS_COLORS[l]}` : 'none',
          }}
        />
      ))}
    </div>
  )
}

export function LANPortsGrid() {
  const [data, setData] = useState<LanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [openPort, setOpenPort] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await api.lanPorts()
        if (!cancelled) {
          setData(r.data)
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
  }, [])

  if (loading && data.length === 0) {
    return (
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 h-[120px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        Cargando…
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 h-[120px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        Sin datos de puertos LAN. Verifica LAN_INTERFACES en .env.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {data.map((p) => {
        const status = statusFromPort(p)
        const util = utilizationPct(p)
        const utilColor = STATUS_COLORS[utilLevel(util)]
        const Icon = p.port_name.toLowerCase().includes('sfp') ? Cable : Network
        const isDown = p.oper_status === 0

        return (
          <button
            key={p.port_name}
            type="button"
            onClick={() => setOpenPort(p.port_name)}
            className="text-left bg-white dark:bg-[#1e2528] rounded-[12px] p-5 flex flex-col hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
            style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
            title={`Ver top hosts de ${p.port_name}`}
          >
            {/* Header: port name + traffic light + icon */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${status === 'red' && isDown ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
                <p
                  className="text-[13px] font-bold uppercase tracking-[0.08em] text-[#161c1f] dark:text-[#ecf2f6] truncate"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  title={p.port_name}
                >
                  {p.port_name}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <TrafficLight level={status} />
                <Icon size={16} style={{ color: colors.textSecondary }} strokeWidth={1.8} />
              </div>
            </div>

            {/* Link speed line */}
            <p
              className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc] mb-3"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {isDown ? 'DOWN' : `${p.speed_mbps || '?'} Mbps link`}
            </p>

            {/* Big throughput numbers */}
            <div className="flex-1 space-y-2 mb-3">
              <div>
                <p
                  className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#4d5e85] dark:text-[#a8c4cc]"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  ↓ Bajada
                </p>
                <p
                  className="text-[1.5rem] font-bold leading-tight text-[#161c1f] dark:text-[#ecf2f6]"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  {isDown ? '—' : formatBps(p.bps_in)}
                </p>
              </div>
              <div>
                <p
                  className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#4d5e85] dark:text-[#a8c4cc]"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  ↑ Subida
                </p>
                <p
                  className="text-[1.5rem] font-bold leading-tight text-[#161c1f] dark:text-[#ecf2f6]"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  {isDown ? '—' : formatBps(p.bps_out)}
                </p>
              </div>
            </div>

            {/* Utilization bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-[9px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc]"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  Utilizacion
                </span>
                <span
                  className="text-[11px] font-bold"
                  style={{ color: utilColor, fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {isDown ? '—' : `${util.toFixed(1)}%`}
                </span>
              </div>
              <div className="h-2 rounded-full bg-[#eef4f8] dark:bg-[#252c2f] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: isDown ? '0%' : `${util}%`,
                    backgroundColor: utilColor,
                  }}
                />
              </div>
            </div>

            {(p.errors_in + p.errors_out > 0) && (
              <p
                className="text-[10px] mt-2 pt-2 border-t border-[#e9eff3] dark:border-[#252c2f]"
                style={{ color: colors.chartAmber, fontFamily: 'JetBrains Mono, monospace' }}
              >
                ⚠ {(p.errors_in + p.errors_out).toFixed(2)} err/s
              </p>
            )}
          </button>
        )
      })}
      <LanPortTopHostsModal port={openPort} onClose={() => setOpenPort(null)} />
    </div>
  )
}
