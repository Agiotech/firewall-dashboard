import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Radio } from 'lucide-react'
import { api } from '../../api/client'
import { colors } from '../../theme/colors'

type Status = Awaited<ReturnType<typeof api.syslogStatus>>

const POLL_MS = 30_000

function fmtAge(s: number | null): string {
  if (s == null) return '—'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${(s / 3600).toFixed(1)}h`
}

export function SyslogStatusBadge() {
  const [status, setStatus] = useState<Status | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const s = await api.syslogStatus()
        if (!cancelled) setStatus(s)
      } catch {
        if (!cancelled) setStatus(null)
      }
    }
    tick()
    const id = setInterval(tick, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (!status) return null

  const isHealthy = status.state === 'running'
  const isDegraded = status.state === 'degraded'
  const isDown = status.state === 'bind_failed' || status.state === 'stopped'

  const color = isHealthy ? colors.chartGreen : isDegraded ? colors.chartAmber : colors.chartRed
  const Icon = isHealthy ? CheckCircle2 : isDown ? AlertTriangle : Radio
  const label =
    isHealthy ? 'Syslog OK'
    : isDegraded ? 'Syslog sin datos'
    : status.state === 'bind_failed' ? 'Syslog bind falló'
    : 'Syslog detenido'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-[#eef4f8] dark:hover:bg-[#252c2f] transition-colors"
        style={{ backgroundColor: color + '14' }}
        title={`${label} (click para detalles)`}
      >
        <Icon size={14} style={{ color }} strokeWidth={2} />
        <span
          className="text-[10px] font-bold uppercase tracking-[0.06em]"
          style={{ color, fontFamily: 'Space Grotesk, sans-serif' }}
        >
          {label}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[320px] bg-white dark:bg-[#1e2528] rounded-[12px] p-4 border border-[#e9eff3] dark:border-[#252c2f] z-50"
          style={{ boxShadow: '0 8px 24px rgba(9,29,65,0.12)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <p
              className="text-[12px] font-bold text-[#161c1f] dark:text-[#ecf2f6] uppercase tracking-[0.08em]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Estado del listener
            </p>
            <button
              onClick={() => setOpen(false)}
              className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] hover:text-[#161c1f] dark:hover:text-[#ecf2f6]"
            >
              cerrar
            </button>
          </div>
          <dl className="space-y-1.5 text-[11px]">
            <Row label="Estado" value={status.state} valueColor={color} />
            <Row label="Bound a" value={status.bound_addr ?? '—'} />
            <Row label="Bind hace" value={fmtAge(status.bound_age_s)} />
            <Row label="Último paquete hace" value={fmtAge(status.last_packet_age_s)} />
            <Row label="Paquetes recibidos" value={status.packets_total.toLocaleString()} />
            <Row label="Filtrados (ACL)" value={status.packets_filtered_acl.toLocaleString()} />
            <Row label="Parseados OK" value={status.packets_parsed.toLocaleString()} />
            <Row label="Errores de parseo" value={status.parse_failures.toLocaleString()} />
            <Row label="Intentos de bind" value={status.bind_attempts.toLocaleString()} />
            {status.last_error && (
              <Row label="Último error" value={status.last_error} valueColor={colors.chartRed} />
            )}
          </dl>
          {isDegraded && (
            <p
              className="mt-3 text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] leading-relaxed"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              El puerto está bound pero no llegan paquetes. Verifica que el USG tenga el Remote Server activo con Traffic Log en Normal, y que el firewall de Windows permita UDP {status.bound_addr?.split(':')[1] ?? '5514'}.
            </p>
          )}
          {isDown && (
            <p
              className="mt-3 text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] leading-relaxed"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              El listener no pudo bindear el puerto. Probablemente está en uso por otro proceso. Reinicia el backend o libera el puerto.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[#4d5e85] dark:text-[#a8c4cc]">{label}</dt>
      <dd
        className="font-mono text-[10px] truncate max-w-[180px]"
        style={{ color: valueColor ?? undefined, fontFamily: 'JetBrains Mono, monospace' }}
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}
