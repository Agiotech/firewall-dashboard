import { useEffect, useState, useCallback } from 'react'
import { Router, Wifi, Network, Monitor, Printer, Phone, Search, RefreshCw, Cpu } from 'lucide-react'

import { api } from '../../api/client'
import { colors } from '../../theme/colors'
import { formatBytes } from '../../utils/format'
import { DeviceDetailModal } from './DeviceDetailModal'

interface Device {
  ip: string
  mac: string | null
  vendor: string | null
  hostname: string | null
  sys_descr: string | null
  device_type: string | null
  snmp_ok: number
  first_seen: number
  last_seen: number
}

const TYPE_META: Record<string, { Icon: typeof Router; color: string; label: string }> = {
  switch: { Icon: Network, color: colors.chartBlue, label: 'Switch' },
  router: { Icon: Router, color: colors.chartCyan, label: 'Router' },
  ap: { Icon: Wifi, color: colors.chartTeal, label: 'Access Point' },
  printer: { Icon: Printer, color: colors.chartIndigo, label: 'Impresora' },
  phone: { Icon: Phone, color: colors.chartPurple, label: 'Telefono' },
  unknown: { Icon: Monitor, color: colors.textGhost, label: 'Host' },
}

function metaForType(t: string | null) {
  return TYPE_META[t ?? 'unknown'] ?? TYPE_META.unknown
}

function ageMin(ts: number): string {
  const m = Math.max(0, Math.floor((Date.now() / 1000 - ts) / 60))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function DevicesGrid() {
  const [devices, setDevices] = useState<Device[]>([])
  const [summary, setSummary] = useState<{ total: number; by_type: Record<string, number>; snmp_ok: number } | null>(null)
  const [traffic, setTraffic] = useState<Record<string, { in: number; out: number; total: number }>>({})
  const [filter, setFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [selectedIp, setSelectedIp] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([api.devices(), api.devicesTrafficTop('1h', 200)])
      setDevices(d.data)
      setSummary(d.summary)
      const trafficMap: Record<string, { in: number; out: number; total: number }> = {}
      for (const r of t.data) {
        trafficMap[r.ip] = { in: r.bytes_in || 0, out: r.bytes_out || 0, total: r.bytes_total || 0 }
      }
      setTraffic(trafficMap)
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

  const handleScan = async () => {
    setScanning(true)
    try {
      await api.triggerDeviceScan()
      setTimeout(load, 5_000)
    } finally {
      setTimeout(() => setScanning(false), 5_000)
    }
  }

  const filtered = devices.filter((d) => {
    if (filter && (d.device_type ?? 'unknown') !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !d.ip.includes(q) &&
        !(d.mac ?? '').toLowerCase().includes(q) &&
        !(d.hostname ?? '').toLowerCase().includes(q) &&
        !(d.vendor ?? '').toLowerCase().includes(q)
      )
        return false
    }
    return true
  })

  const sorted = filtered
    .map((d) => ({ ...d, _traffic: traffic[d.ip]?.total ?? 0 }))
    .sort((a, b) => b._traffic - a._traffic)

  const types = ['switch', 'router', 'ap', 'printer', 'phone', 'unknown']

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
          {types.map((t) => {
            const meta = metaForType(t)
            const count = summary?.by_type?.[t] ?? 0
            if (count === 0) return null
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
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-[#4d5e85] dark:text-[#a8c4cc]"
            />
            <input
              type="text"
              placeholder="IP / MAC / hostname"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-[11px] rounded-[8px] bg-white dark:bg-[#1e2528] border border-[#e9eff3] dark:border-[#252c2f] outline-none focus:ring-2 focus:ring-[#00b6cc] w-[200px]"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
          </div>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] rounded-[8px] bg-[#00b6cc] text-white disabled:opacity-50"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            title="Re-escanear ARP del firewall"
          >
            <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} strokeWidth={2} />
            {scanning ? 'Escaneando...' : 'Re-scan'}
          </button>
        </div>
      </div>

      {loading && devices.length === 0 ? (
        <div
          className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 h-[180px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
        >
          Cargando dispositivos...
        </div>
      ) : sorted.length === 0 ? (
        <div
          className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 h-[180px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8"
          style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
        >
          Aun no hay dispositivos. El primer escaneo corre 30s despues del arranque, despues cada 30 min.
          <br />Puedes forzar uno con el boton Re-scan.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {sorted.slice(0, 60).map((d) => {
            const meta = metaForType(d.device_type)
            const Icon = meta.Icon
            const t = traffic[d.ip]
            return (
              <button
                key={d.ip}
                onClick={() => setSelectedIp(d.ip)}
                className="bg-white dark:bg-[#1e2528] rounded-[12px] p-4 text-left cursor-pointer hover:shadow-lg transition-shadow"
                style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
                title="Click para ver detalle"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: meta.color + '1a' }}
                    >
                      <Icon size={14} style={{ color: meta.color }} strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-[11px] font-bold text-[#161c1f] dark:text-[#ecf2f6] truncate"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        {d.ip}
                      </p>
                      <p
                        className="text-[9px] uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc] truncate"
                        style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                      >
                        {meta.label}
                        {d.snmp_ok ? ' · SNMP' : ''}
                      </p>
                    </div>
                  </div>
                  {d.snmp_ok ? <Cpu size={12} className="text-[#66BB6A]" strokeWidth={2} /> : null}
                </div>

                <div className="space-y-1 text-[10px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {d.hostname && (
                    <p className="text-[#161c1f] dark:text-[#ecf2f6] truncate" title={d.hostname}>
                      {d.hostname}
                    </p>
                  )}
                  {d.mac && (
                    <p className="text-[#4d5e85] dark:text-[#a8c4cc]">
                      {d.mac}
                    </p>
                  )}
                  {d.vendor && (
                    <p className="text-[#4d5e85] dark:text-[#a8c4cc] truncate">{d.vendor}</p>
                  )}
                </div>

                {t && t.total > 0 && (
                  <div
                    className="mt-2 pt-2 border-t border-[#e9eff3] dark:border-[#252c2f] text-[10px]"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    <span className="text-[#66BB6A]">↓ {formatBytes(t.in)}</span>
                    {' · '}
                    <span className="text-[#FFA726]">↑ {formatBytes(t.out)}</span>
                    <span className="text-[#4d5e85] dark:text-[#a8c4cc]"> /1h</span>
                  </div>
                )}

                <p
                  className="mt-2 text-[9px] text-[#4d5e85] dark:text-[#a8c4cc]"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  visto hace {ageMin(d.last_seen)}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {sorted.length > 60 && (
        <p className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] text-center">
          Mostrando los 60 con mas trafico de {sorted.length} dispositivos detectados. Filtra arriba para ver mas.
        </p>
      )}

      <DeviceDetailModal ip={selectedIp} onClose={() => setSelectedIp(null)} />
    </div>
  )
}
