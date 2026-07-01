import { useEffect, useState } from 'react'
import { AlertOctagon, AlertTriangle, Info, MessageSquare } from 'lucide-react'

import { api } from '../../api/client'
import { colors } from '../../theme/colors'

interface Evt {
  id: number
  ts: number
  priority: string
  category: string
  message: string
  src_ip: string | null
  src_port: number | null
  dst_ip: string | null
  dst_port: number | null
  action: string | null
  note: string | null
}

const PRIORITY_META: Record<string, { color: string; Icon: typeof Info; label: string }> = {
  alert: { color: colors.chartRed, Icon: AlertOctagon, label: 'ALERT' },
  critical: { color: colors.chartRed, Icon: AlertOctagon, label: 'CRIT' },
  error: { color: colors.chartRed, Icon: AlertOctagon, label: 'ERR' },
  warning: { color: colors.chartAmber, Icon: AlertTriangle, label: 'WARN' },
  notice: { color: colors.chartCyan, Icon: Info, label: 'NOTICE' },
  info: { color: colors.chartIndigo, Icon: Info, label: 'INFO' },
  debug: { color: colors.textGhost, Icon: MessageSquare, label: 'DEBUG' },
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('es-MX')
}

export function EventsFeed() {
  const [events, setEvents] = useState<Evt[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await api.events(filter ?? undefined, undefined, 50)
        if (!cancelled) {
          setEvents(r.data)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 15_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [filter])

  const filters = ['alert', 'warning', 'notice', 'info'] as const

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <p
          className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          Eventos recientes
        </p>
        <div className="flex gap-1">
          <button
            onClick={() => setFilter(null)}
            className={`px-2 py-1 text-[10px] font-bold rounded-md uppercase tracking-[0.06em] ${
              filter === null
                ? 'bg-[#eef4f8] dark:bg-[#252c2f] text-[#161c1f] dark:text-[#ecf2f6]'
                : 'text-[#4d5e85] dark:text-[#a8c4cc]'
            }`}
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Todos
          </button>
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 text-[10px] font-bold rounded-md uppercase tracking-[0.06em] ${
                filter === f
                  ? 'bg-[#eef4f8] dark:bg-[#252c2f] text-[#161c1f] dark:text-[#ecf2f6]'
                  : 'text-[#4d5e85] dark:text-[#a8c4cc]'
              }`}
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading && events.length === 0 ? (
        <p className="text-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] py-8">Cargando…</p>
      ) : events.length === 0 ? (
        <p className="text-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] py-8">
          Sin eventos en este rango
        </p>
      ) : (
        <div className="max-h-[460px] overflow-auto">
          <table className="w-full text-[11px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            <thead>
              <tr className="border-b border-[#e9eff3] dark:border-[#252c2f]">
                <th className="text-left py-2 px-2 font-bold text-[#4d5e85] dark:text-[#a8c4cc] uppercase tracking-wider text-[9px]">
                  Hora
                </th>
                <th className="text-left py-2 px-2 font-bold text-[#4d5e85] dark:text-[#a8c4cc] uppercase tracking-wider text-[9px]">
                  Sev
                </th>
                <th className="text-left py-2 px-2 font-bold text-[#4d5e85] dark:text-[#a8c4cc] uppercase tracking-wider text-[9px]">
                  Categoría
                </th>
                <th className="text-left py-2 px-2 font-bold text-[#4d5e85] dark:text-[#a8c4cc] uppercase tracking-wider text-[9px]">
                  Mensaje
                </th>
                <th className="text-left py-2 px-2 font-bold text-[#4d5e85] dark:text-[#a8c4cc] uppercase tracking-wider text-[9px]">
                  Origen → Destino
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => {
                const meta = PRIORITY_META[e.priority] ?? PRIORITY_META.info
                const Icon = meta.Icon
                return (
                  <tr
                    key={e.id}
                    className={`border-b border-[#e9eff3] dark:border-[#252c2f] ${i % 2 === 1 ? 'bg-[#f8fafc] dark:bg-[#252c2f]' : ''}`}
                  >
                    <td className="py-1.5 px-2 text-[#3c494c] dark:text-[#a8c4cc]">{fmtTime(e.ts)}</td>
                    <td className="py-1.5 px-2">
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                        style={{ backgroundColor: meta.color + '22', color: meta.color, fontFamily: 'Space Grotesk, sans-serif' }}
                      >
                        <Icon size={11} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-[#161c1f] dark:text-[#ecf2f6]">{e.category}</td>
                    <td className="py-1.5 px-2 text-[#3c494c] dark:text-[#c0d4da] truncate max-w-[400px]">
                      {e.message || '—'}
                    </td>
                    <td className="py-1.5 px-2 text-[#4d5e85] dark:text-[#a8c4cc] text-[10px]">
                      {e.src_ip ? `${e.src_ip}:${e.src_port ?? '-'} → ${e.dst_ip}:${e.dst_port ?? '-'}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
