import { useEffect, useState, useCallback } from 'react'
import { Wifi, Network, Printer, Server, Cctv, Monitor, Search, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'

import { api } from '../../api/client'
import { colors } from '../../theme/colors'
import { formatBytes } from '../../utils/format'
import { DeviceDetailModal } from './DeviceDetailModal'

interface InventoryDevice {
  type: string
  type_label: string
  name: string
  ip: string
  mac: string
  bytes_in: number
  bytes_out: number
  bytes_total: number
}

const TYPE_META: Record<string, { Icon: typeof Wifi; color: string; label: string }> = {
  ap: { Icon: Wifi, color: colors.chartTeal, label: 'Access Point' },
  printer: { Icon: Printer, color: colors.chartIndigo, label: 'Impresora' },
  server: { Icon: Server, color: colors.chartGreen, label: 'Servidor' },
  switch: { Icon: Network, color: colors.chartBlue, label: 'Switch' },
  xvr: { Icon: Cctv, color: colors.chartPurple, label: 'XVR' },
}

function metaForType(t: string) {
  return TYPE_META[t] ?? { Icon: Monitor, color: colors.textGhost, label: t }
}

const RANGES: { key: string; label: string }[] = [
  { key: '1h', label: '1h' },
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
]

const TYPE_ORDER = ['ap', 'printer', 'server', 'switch', 'xvr']

export function InventoryGrid() {
  const [devices, setDevices] = useState<InventoryDevice[]>([])
  const [summary, setSummary] = useState<{ total: number; by_type: Record<string, number> } | null>(null)
  const [filter, setFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [range, setRange] = useState('7d')
  const [loading, setLoading] = useState(true)
  const [selectedIp, setSelectedIp] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await api.devicesInventory(range)
      setDevices(d.data)
      setSummary(d.summary)
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  const filtered = devices.filter((d) => {
    if (filter && d.type !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !d.ip.includes(q) &&
        !d.mac.toLowerCase().includes(q) &&
        !d.name.toLowerCase().includes(q) &&
        !d.type_label.toLowerCase().includes(q)
      )
        return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => b.bytes_total - a.bytes_total)
  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? range
  const maxTotal = sorted.reduce((m, d) => Math.max(m, d.bytes_total), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilter(null)}
            className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] rounded-[8px] ${
              filter === null
                ? 'bg-[#161c1f] text-white dark:bg-white dark:text-[#161c1f]'
                : 'bg-[#eef4f8] dark:bg-[#252c2f] text-[#4d5e85] dark:text-[#a8c4cc]'
            }`}
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Todos {summary && `(${summary.total})`}
          </button>
          {TYPE_ORDER.map((t) => {
            const count = summary?.by_type?.[t] ?? 0
            if (count === 0) return null
            const meta = metaForType(t)
            const Icon = meta.Icon
            return (
              <button
                key={t}
                onClick={() => setFilter(filter === t ? null : t)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] rounded-[8px] ${
                  filter === t
                    ? 'text-white dark:text-[#161c1f]'
                    : 'bg-[#eef4f8] dark:bg-[#252c2f] text-[#4d5e85] dark:text-[#a8c4cc]'
                }`}
                style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  backgroundColor: filter === t ? meta.color : undefined,
                }}
              >
                <Icon size={12} strokeWidth={2} />
                {meta.label} ({count})
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#eef4f8] dark:bg-[#252c2f] rounded-[8px] p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] rounded-[6px] ${
                  range === r.key
                    ? 'bg-[#00b6cc] text-white'
                    : 'text-[#4d5e85] dark:text-[#a8c4cc]'
                }`}
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                title={`Consumo en las últimas ${r.label}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-[#4d5e85] dark:text-[#a8c4cc]"
            />
            <input
              type="text"
              placeholder="Equipo / IP / MAC"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-[11px] rounded-[8px] bg-white dark:bg-[#1e2528] border border-[#e9eff3] dark:border-[#252c2f] outline-none focus:ring-2 focus:ring-[#00b6cc] w-[200px]"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
          </div>
        </div>
      </div>

      {loading && devices.length === 0 ? (
        <div
          className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 h-[180px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
        >
          Cargando inventario...
        </div>
      ) : sorted.length === 0 ? (
        <div
          className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 h-[180px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8"
          style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
        >
          Ningún equipo coincide con el filtro.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((d) => {
            const meta = metaForType(d.type)
            const Icon = meta.Icon
            const hasTraffic = d.bytes_total > 0
            const totalPct = maxTotal > 0 ? (d.bytes_total / maxTotal) * 100 : 0
            const inShare = d.bytes_total > 0 ? (d.bytes_in / d.bytes_total) * 100 : 0
            const outShare = 100 - inShare
            return (
              <button
                key={d.ip}
                onClick={() => setSelectedIp(d.ip)}
                className="group bg-white dark:bg-[#1e2528] rounded-[12px] p-5 text-left cursor-pointer border border-[#e9eff3] dark:border-[#252c2f] shadow-card hover:shadow-card-hover transition-shadow"
                title="Click para ver detalle"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: meta.color + '1a' }}
                  >
                    <Icon size={18} style={{ color: meta.color }} strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[13px] font-bold text-[#161c1f] dark:text-[#ecf2f6] truncate leading-tight"
                      style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                      title={d.name}
                    >
                      {d.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-[5px]"
                        style={{
                          fontFamily: 'Space Grotesk, sans-serif',
                          color: meta.color,
                          backgroundColor: meta.color + '14',
                        }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p
                      className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] truncate mt-1.5"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                      title={d.mac}
                    >
                      {d.ip} · {d.mac}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-[#e9eff3] dark:border-[#252c2f]">
                  {hasTraffic ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-[10px] px-3 py-2" style={{ backgroundColor: colors.chartGreen + '14' }}>
                          <div className="flex items-center gap-1 mb-0.5">
                            <ArrowDownToLine size={12} style={{ color: colors.chartGreen }} strokeWidth={2.4} />
                            <span
                              className="text-[9px] font-bold uppercase tracking-[0.08em]"
                              style={{ fontFamily: 'Space Grotesk, sans-serif', color: colors.chartGreen }}
                            >
                              Bajada
                            </span>
                          </div>
                          <p
                            className="text-[17px] font-bold text-[#161c1f] dark:text-[#ecf2f6] leading-none tabular-nums"
                            style={{ fontFamily: 'JetBrains Mono, monospace' }}
                          >
                            {formatBytes(d.bytes_in)}
                          </p>
                        </div>
                        <div className="rounded-[10px] px-3 py-2" style={{ backgroundColor: colors.chartAmber + '14' }}>
                          <div className="flex items-center gap-1 mb-0.5">
                            <ArrowUpFromLine size={12} style={{ color: colors.chartAmber }} strokeWidth={2.4} />
                            <span
                              className="text-[9px] font-bold uppercase tracking-[0.08em]"
                              style={{ fontFamily: 'Space Grotesk, sans-serif', color: colors.chartAmber }}
                            >
                              Subida
                            </span>
                          </div>
                          <p
                            className="text-[17px] font-bold text-[#161c1f] dark:text-[#ecf2f6] leading-none tabular-nums"
                            style={{ fontFamily: 'JetBrains Mono, monospace' }}
                          >
                            {formatBytes(d.bytes_out)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className="text-[9px] uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc]"
                            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                          >
                            Total /{rangeLabel}
                          </span>
                          <span
                            className="text-[11px] font-bold text-[#161c1f] dark:text-[#ecf2f6] tabular-nums"
                            style={{ fontFamily: 'JetBrains Mono, monospace' }}
                          >
                            {formatBytes(d.bytes_total)}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-[#eef4f8] dark:bg-[#252c2f] overflow-hidden">
                          <div className="h-full flex" style={{ width: `${Math.max(totalPct, 2)}%` }}>
                            <div className="h-full" style={{ width: `${inShare}%`, backgroundColor: colors.chartGreen }} />
                            <div className="h-full" style={{ width: `${outShare}%`, backgroundColor: colors.chartAmber }} />
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p
                      className="text-[11px] text-[#bbc9cc] dark:text-[#4d5e85] py-3 text-center"
                      style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                    >
                      Sin tráfico en {rangeLabel}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <DeviceDetailModal ip={selectedIp} onClose={() => setSelectedIp(null)} />
    </div>
  )
}
