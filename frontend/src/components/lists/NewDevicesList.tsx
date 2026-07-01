import { useEffect, useState } from 'react'
import { Sparkles, Monitor } from 'lucide-react'

import { api } from '../../api/client'
import { colors } from '../../theme/colors'

export function NewDevicesList() {
  const [devices, setDevices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)

  useEffect(() => {
    let cancelled = false
    api.newDevices(days, 100).then((r) => {
      if (!cancelled) { setDevices(r.data); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
  }, [days])

  function ageStr(ts: number): string {
    const sec = Math.floor(Date.now() / 1000 - ts)
    if (sec < 3600) return `${Math.floor(sec / 60)}m`
    if (sec < 86400) return `${Math.floor(sec / 3600)}h`
    return `${Math.floor(sec / 86400)}d`
  }

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} style={{ color: colors.chartCyan }} strokeWidth={2} />
          <p
            className="text-[12px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Dispositivos nuevos ({devices.length})
          </p>
        </div>
        <div className="flex items-center gap-1 bg-[#eef4f8] dark:bg-[#252c2f] rounded-[8px] p-0.5">
          {[1, 7, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-[6px] ${
                days === d
                  ? 'bg-white dark:bg-[#1e2528] text-[#161c1f] dark:text-[#ecf2f6]'
                  : 'text-[#4d5e85] dark:text-[#a8c4cc]'
              }`}
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <p className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] py-4 text-center">Cargando...</p>
      ) : devices.length === 0 ? (
        <p className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] py-4 text-center">
          Sin dispositivos nuevos en los últimos {days} días.
        </p>
      ) : (
        <div className="max-h-[320px] overflow-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-white dark:bg-[#1e2528]">
              <tr className="border-b border-[#e9eff3] dark:border-[#252c2f]">
                {['IP', 'MAC', 'Vendor', 'Hostname', 'Visto hace'].map((h) => (
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
              {devices.map((d, i) => (
                <tr
                  key={d.ip}
                  className={`border-b border-[#e9eff3] dark:border-[#252c2f] ${i % 2 === 1 ? 'bg-[#f8fafc] dark:bg-[#252c2f]' : ''}`}
                >
                  <td className="py-1.5 px-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    <span className="inline-flex items-center gap-1">
                      <Monitor size={11} className="text-[#4d5e85] dark:text-[#a8c4cc]" />
                      {d.ip}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-[#3c494c] dark:text-[#c0d4da]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {d.mac || '—'}
                  </td>
                  <td className="py-1.5 px-2 text-[#4d5e85] dark:text-[#a8c4cc]">{d.vendor || '—'}</td>
                  <td className="py-1.5 px-2 text-[#161c1f] dark:text-[#ecf2f6]">{d.hostname || '—'}</td>
                  <td className="py-1.5 px-2 text-[#4d5e85] dark:text-[#a8c4cc]">{ageStr(d.first_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
