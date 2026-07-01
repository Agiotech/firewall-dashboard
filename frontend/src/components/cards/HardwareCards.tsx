import { useEffect, useState } from 'react'
import { Thermometer, Fan, Zap, AlertCircle } from 'lucide-react'

import { api } from '../../api/client'
import { colors } from '../../theme/colors'

interface HwReading {
  ts: number
  kind: string
  name: string
  value: number
  unit: string | null
}

const KIND_META: Record<string, { Icon: typeof Thermometer; color: string; label: string }> = {
  temp: { Icon: Thermometer, color: colors.chartRed, label: 'Temperatura' },
  fan: { Icon: Fan, color: colors.chartCyan, label: 'Ventiladores' },
  psu: { Icon: Zap, color: colors.chartAmber, label: 'Fuente' },
}

export function HardwareCards() {
  const [data, setData] = useState<HwReading[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await api.hardwareLatest()
        if (!cancelled) { setData(r.data); setLoading(false) }
      } catch { if (!cancelled) setLoading(false) }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (loading) {
    return (
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 h-[140px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        Consultando sensores...
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 flex items-center gap-3"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        <div
          className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: colors.chartAmber + '1a' }}
        >
          <AlertCircle size={16} style={{ color: colors.chartAmber }} strokeWidth={1.8} />
        </div>
        <div>
          <p
            className="text-[12px] font-bold text-[#161c1f] dark:text-[#ecf2f6]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            El firmware del USG no expone sensores via SNMP
          </p>
          <p className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] mt-0.5">
            Temperatura, fans y PSU no están disponibles en la rama estándar. Si Zyxel publica OIDs proprietarios específicos para tu firmware, los agregamos.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {data.map((h) => {
        const meta = KIND_META[h.kind] ?? { Icon: AlertCircle, color: colors.textGhost, label: h.kind }
        const Icon = meta.Icon
        return (
          <div
            key={`${h.kind}-${h.name}`}
            className="bg-white dark:bg-[#1e2528] rounded-[12px] p-4"
            style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-8 h-8 rounded-[8px] flex items-center justify-center"
                style={{ backgroundColor: meta.color + '1a' }}
              >
                <Icon size={14} style={{ color: meta.color }} strokeWidth={1.8} />
              </div>
              <p
                className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                {h.name}
              </p>
            </div>
            <p
              className="text-[1.75rem] font-bold leading-none text-[#161c1f] dark:text-[#ecf2f6]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {h.value.toFixed(1)}
              {h.unit && <span className="text-[12px] text-[#4d5e85] dark:text-[#a8c4cc] ml-1">{h.unit}</span>}
            </p>
            <p
              className="text-[9px] text-[#4d5e85] dark:text-[#a8c4cc] mt-1 uppercase tracking-[0.08em]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {meta.label}
            </p>
          </div>
        )
      })}
    </div>
  )
}
