import { useEffect, useState, useCallback } from 'react'
import { Shield, ShieldCheck, ShieldAlert, ShieldOff, User, Globe2 } from 'lucide-react'

import { api } from '../../api/client'
import { colors } from '../../theme/colors'

interface Tunnel {
  name: string
  peer_ip: string | null
  local_ip: string | null
  state: string | null
  last_event_msg: string | null
  last_event_ts: number | null
  last_dpd_ts: number | null
  dpd_count: number
  rekeys: number
  first_seen: number
  last_seen: number
  age_sec: number
  health: 'healthy' | 'stale' | 'down' | 'unknown'
}

interface ClientSession {
  id: number
  username: string | null
  src_ip: string | null
  assigned_ip: string | null
  vpn_type: string | null
  started_at: number
  ended_at: number | null
  duration_sec: number
  active: boolean
}

const HEALTH_META: Record<Tunnel['health'], { color: string; label: string; Icon: typeof Shield }> = {
  healthy: { color: colors.chartGreen, label: 'UP', Icon: ShieldCheck },
  stale: { color: colors.chartAmber, label: 'STALE', Icon: ShieldAlert },
  down: { color: colors.chartRed, label: 'DOWN', Icon: ShieldOff },
  unknown: { color: colors.textGhost, label: '?', Icon: Shield },
}

function ageStr(sec: number | null | undefined): string {
  if (sec == null) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

function durationStr(sec: number): string {
  return ageStr(sec)
}

function fmtDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('es-MX', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function VpnSection() {
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [tSummary, setTSummary] = useState<{ total: number; up: number; stale: number; down: number; unknown: number } | null>(null)
  const [clients, setClients] = useState<ClientSession[]>([])
  const [cSummary, setCSummary] = useState<{ active: number; last_24h: number } | null>(null)
  const [filter, setFilter] = useState<'all' | 'healthy' | 'stale' | 'down'>('all')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([api.vpnTunnels(), api.vpnClients(false, 50)])
      setTunnels(t.data)
      setTSummary(t.summary)
      setClients(c.data)
      setCSummary(c.summary)
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  const filtered = filter === 'all' ? tunnels : tunnels.filter((t) => t.health === filter)

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Túneles UP"
          value={tSummary?.up ?? 0}
          total={tSummary?.total ?? 0}
          color={colors.chartGreen}
          Icon={ShieldCheck}
        />
        <SummaryCard
          label="Stale (sin DPD reciente)"
          value={tSummary?.stale ?? 0}
          total={tSummary?.total ?? 0}
          color={colors.chartAmber}
          Icon={ShieldAlert}
        />
        <SummaryCard
          label="Túneles DOWN"
          value={tSummary?.down ?? 0}
          total={tSummary?.total ?? 0}
          color={colors.chartRed}
          Icon={ShieldOff}
        />
        <SummaryCard
          label="Clientes VPN activos"
          value={cSummary?.active ?? 0}
          total={cSummary?.last_24h ?? 0}
          totalLabel="24h"
          color={colors.chartCyan}
          Icon={User}
        />
      </div>

      {/* Tunnel filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'healthy', 'stale', 'down'] as const).map((f) => {
          const labels = { all: 'Todos', healthy: 'UP', stale: 'Stale', down: 'DOWN' }
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] rounded-[8px] ${
                filter === f
                  ? 'bg-[#161c1f] text-white dark:bg-white dark:text-[#161c1f]'
                  : 'bg-[#eef4f8] dark:bg-[#252c2f] text-[#4d5e85] dark:text-[#a8c4cc]'
              }`}
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {labels[f]}
            </button>
          )
        })}
      </div>

      {/* Tunnels grid */}
      <div>
        <p
          className="text-[12px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc] mb-3"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          Túneles Site-to-Site
        </p>
        {loading && filtered.length === 0 ? (
          <div className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 h-[120px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]"
            style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}>
            Cargando...
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 h-[120px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8"
            style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}>
            Aún no hay datos de túneles. Los túneles aparecen cuando llega su primer evento syslog (DPD, IKE, etc.).
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((t) => {
              const meta = HEALTH_META[t.health]
              const Icon = meta.Icon
              return (
                <div
                  key={t.name}
                  className="bg-white dark:bg-[#1e2528] rounded-[12px] p-4"
                  style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-9 h-9 rounded-[8px] flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: meta.color + '1a' }}
                      >
                        <Icon size={16} style={{ color: meta.color }} strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0">
                        <p
                          className="text-[12px] font-bold text-[#161c1f] dark:text-[#ecf2f6] truncate"
                          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                          title={t.name}
                        >
                          {t.name}
                        </p>
                        <p
                          className="text-[10px] uppercase tracking-[0.08em]"
                          style={{ color: meta.color, fontFamily: 'Space Grotesk, sans-serif' }}
                        >
                          {meta.label}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    className="space-y-1 text-[11px]"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {t.peer_ip && (
                      <p className="text-[#3c494c] dark:text-[#c0d4da] truncate">
                        <span className="text-[#4d5e85] dark:text-[#a8c4cc]">peer </span>
                        {t.peer_ip}
                      </p>
                    )}
                    {t.local_ip && (
                      <p className="text-[#3c494c] dark:text-[#c0d4da] truncate">
                        <span className="text-[#4d5e85] dark:text-[#a8c4cc]">local </span>
                        {t.local_ip}
                      </p>
                    )}
                  </div>

                  <div className="mt-2 pt-2 border-t border-[#e9eff3] dark:border-[#252c2f] text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] space-y-0.5"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    <p>
                      Último DPD: <span className="text-[#161c1f] dark:text-[#ecf2f6]">{ageStr(t.last_dpd_ts ? Math.floor(Date.now() / 1000 - t.last_dpd_ts) : null)}</span>
                      {' · '}
                      DPDs: <span className="text-[#161c1f] dark:text-[#ecf2f6]">{t.dpd_count.toLocaleString('es-MX')}</span>
                    </p>
                    <p>
                      Rekeys: <span className="text-[#161c1f] dark:text-[#ecf2f6]">{t.rekeys}</span>
                      {' · '}
                      Activo: <span className="text-[#161c1f] dark:text-[#ecf2f6]">{ageStr(Math.floor((Date.now() / 1000 - t.first_seen)))}</span>
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Client VPN sessions */}
      <div>
        <p
          className="text-[12px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc] mb-3"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          Sesiones VPN cliente (L2TP / SSL / IKEv2)
        </p>
        {clients.length === 0 ? (
          <div className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 h-[120px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8"
            style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}>
            Sin sesiones VPN cliente registradas. Se detectan automáticamente cuando un usuario L2TP/SSL VPN inicia o cierra sesión.
          </div>
        ) : (
          <div className="bg-white dark:bg-[#1e2528] rounded-[12px] p-4 overflow-hidden"
            style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}>
            <table className="w-full text-[11px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <thead>
                <tr className="border-b border-[#e9eff3] dark:border-[#252c2f]">
                  {['Usuario', 'IP origen', 'IP asignada', 'Tipo', 'Inicio', 'Duración', 'Estado'].map((h) => (
                    <th
                      key={h}
                      className="text-left py-2 px-2 font-bold text-[#4d5e85] dark:text-[#a8c4cc] uppercase tracking-wider text-[9px]"
                      style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((c, i) => (
                  <tr
                    key={c.id}
                    className={`border-b border-[#e9eff3] dark:border-[#252c2f] ${i % 2 === 1 ? 'bg-[#f8fafc] dark:bg-[#252c2f]' : ''}`}
                  >
                    <td className="py-1.5 px-2 text-[#161c1f] dark:text-[#ecf2f6]">
                      <span className="inline-flex items-center gap-1">
                        <User size={11} className="text-[#4d5e85] dark:text-[#a8c4cc]" />
                        {c.username || '—'}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-[#3c494c] dark:text-[#c0d4da]">{c.src_ip || '—'}</td>
                    <td className="py-1.5 px-2 text-[#3c494c] dark:text-[#c0d4da]">{c.assigned_ip || '—'}</td>
                    <td className="py-1.5 px-2 text-[#4d5e85] dark:text-[#a8c4cc]">{c.vpn_type || '—'}</td>
                    <td className="py-1.5 px-2 text-[#4d5e85] dark:text-[#a8c4cc]">{fmtDateTime(c.started_at)}</td>
                    <td className="py-1.5 px-2 text-[#161c1f] dark:text-[#ecf2f6]">{durationStr(c.duration_sec)}</td>
                    <td className="py-1.5 px-2">
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                        style={{
                          backgroundColor: (c.active ? colors.chartGreen : colors.textGhost) + '22',
                          color: c.active ? colors.chartGreen : colors.textGhost,
                          fontFamily: 'Space Grotesk, sans-serif',
                        }}
                      >
                        {c.active ? 'Activo' : 'Cerrado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label, value, total, totalLabel, color, Icon,
}: {
  label: string
  value: number
  total: number
  totalLabel?: string
  color: string
  Icon: typeof Shield
}) {
  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-4"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      <div className="flex items-start justify-between mb-2">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          {label}
        </p>
        <div
          className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: color + '1a' }}
        >
          <Icon size={14} style={{ color }} strokeWidth={1.8} />
        </div>
      </div>
      <p
        className="text-[1.75rem] font-bold leading-none text-[#161c1f] dark:text-[#ecf2f6]"
        style={{ fontFamily: 'Space Grotesk, sans-serif' }}
      >
        {value}
      </p>
      <p className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] mt-1">
        de {total} {totalLabel ?? 'total'}
      </p>
    </div>
  )
}

export { Globe2 }
