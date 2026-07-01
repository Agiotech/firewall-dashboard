import { useEffect, useState } from 'react'
import { X, ArrowDown, ArrowUp, Network, AlertCircle } from 'lucide-react'

import { api } from '../../api/client'
import { colors } from '../../theme/colors'
import { formatBytes, formatNumber } from '../../utils/format'

interface Props {
  port: string | null
  onClose: () => void
}

interface HostRow {
  host: string
  total_bytes: number
  total_packets: number
}

const RANGES = [
  { v: '1h', label: '1h' },
  { v: '6h', label: '6h' },
  { v: '24h', label: '24h' },
  { v: '7d', label: '7d' },
] as const

type Range = (typeof RANGES)[number]['v']

export function LanPortTopHostsModal({ port, onClose }: Props) {
  const [download, setDownload] = useState<HostRow[]>([])
  const [upload, setUpload] = useState<HostRow[]>([])
  const [configured, setConfigured] = useState<boolean>(true)
  const [cidr, setCidr] = useState<string | null>(null)
  const [suggested, setSuggested] = useState<{ cidr: string; bytes: number; hosts: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [range, setRange] = useState<Range>('24h')

  useEffect(() => {
    if (!port) return
    let cancelled = false
    setLoading(true)
    api.lanPortTopHosts(port, range, 20).then((r) => {
      if (cancelled) return
      setDownload(r.download)
      setUpload(r.upload)
      setConfigured(r.configured)
      setCidr(r.cidr)
      setSuggested(r.suggested_subnets)
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [port, range])

  useEffect(() => {
    if (!port) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [port, onClose])

  if (!port) return null

  const totalDown = download.reduce((s, r) => s + r.total_bytes, 0)
  const totalUp = upload.reduce((s, r) => s + r.total_bytes, 0)
  const maxRows = Math.max(download.length, upload.length, 1)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[14px] w-full max-w-[1100px] max-h-[90vh] overflow-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.28)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eff3] dark:border-[#252c2f] sticky top-0 bg-white dark:bg-[#1e2528] z-10">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-[10px] flex items-center justify-center"
              style={{ backgroundColor: colors.chartCyan + '1a' }}
            >
              <Network size={18} style={{ color: colors.chartCyan }} strokeWidth={1.8} />
            </div>
            <div>
              <p
                className="text-[16px] font-bold text-[#161c1f] dark:text-[#ecf2f6]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Top consumidores — {port}
              </p>
              <p className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
                IPs con más bytes contra peers externos en el rango seleccionado
                {cidr && (
                  <span className="ml-2 font-mono text-[#161c1f] dark:text-[#ecf2f6]">
                    · {cidr}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[#eef4f8] dark:bg-[#252c2f] rounded-[8px] p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.v}
                  onClick={() => setRange(r.v)}
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-[6px] ${
                    range === r.v
                      ? 'bg-white dark:bg-[#1e2528] text-[#161c1f] dark:text-[#ecf2f6]'
                      : 'text-[#4d5e85] dark:text-[#a8c4cc]'
                  }`}
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1 hover:bg-[#eef4f8] dark:hover:bg-[#252c2f]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {!configured ? (
            <div
              className="rounded-[10px] p-4"
              style={{ backgroundColor: colors.chartAmber + '14', border: `1px solid ${colors.chartAmber}33` }}
            >
              <div className="flex items-start gap-2 mb-2">
                <AlertCircle size={16} style={{ color: colors.chartAmber, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p
                    className="text-[12px] font-bold text-[#161c1f] dark:text-[#ecf2f6]"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    Puerto sin subnet configurada
                  </p>
                  <p className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] mt-1 leading-relaxed">
                    Para filtrar los top hosts por el VLAN que sirve este puerto, agrega el mapeo en <code className="font-mono">backend/.env</code>:
                  </p>
                </div>
              </div>
              <pre
                className="mt-2 p-2 rounded text-[9px] overflow-x-auto"
                style={{ backgroundColor: '#1e252810', fontFamily: 'JetBrains Mono, monospace' }}
              >
{`LAN_PORT_SUBNETS={"${port}":"192.168.X.0/24", ...}`}
              </pre>
            </div>
          ) : loading ? (
            <div className="h-[300px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
              Cargando…
            </div>
          ) : download.length === 0 && upload.length === 0 ? (
            <div className="space-y-4">
              <div
                className="rounded-[10px] p-4 text-center"
                style={{ backgroundColor: colors.chartAmber + '14', border: `1px solid ${colors.chartAmber}33` }}
              >
                <p
                  className="text-[12px] font-bold text-[#161c1f] dark:text-[#ecf2f6] mb-1"
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  Sin tráfico para <code className="font-mono">{cidr}</code> en el rango {range}
                </p>
                <p className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] leading-relaxed">
                  El CIDR configurado para <b>{port}</b> no tiene flujos registrados. Probablemente la subnet real del puerto es distinta.
                </p>
              </div>

              {suggested.length > 0 && (
                <div
                  className="rounded-[10px] p-4"
                  style={{ backgroundColor: '#f4fafe', border: '1px solid #e9eff3' }}
                >
                  <p
                    className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#4d5e85] mb-2"
                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    Subnets activas detectadas (top {suggested.length})
                  </p>
                  <p className="text-[11px] text-[#3c494c] mb-3 leading-relaxed">
                    Estas subredes <b>sí</b> tienen tráfico. Edita <code className="font-mono">backend/.env</code> y reemplaza el CIDR del puerto <b>{port}</b> con la que corresponda a tu VLAN:
                  </p>
                  <ul className="space-y-1">
                    {suggested.map((s) => (
                      <li key={s.cidr} className="flex items-center justify-between text-[11px]">
                        <span
                          className="font-mono text-[#161c1f] dark:text-[#ecf2f6]"
                          style={{ fontFamily: 'JetBrains Mono, monospace' }}
                        >
                          {s.cidr}
                        </span>
                        <span
                          className="text-[#4d5e85]"
                          style={{ fontFamily: 'JetBrains Mono, monospace' }}
                        >
                          {s.hosts} host{s.hosts !== 1 ? 's' : ''} · {formatBytes(s.bytes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Totales */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SummaryCard
                  icon={ArrowDown}
                  label="Total bajada (in)"
                  value={formatBytes(totalDown)}
                  color={colors.chartGreen}
                  detail={`${download.length} host${download.length !== 1 ? 's' : ''}`}
                />
                <SummaryCard
                  icon={ArrowUp}
                  label="Total subida (out)"
                  value={formatBytes(totalUp)}
                  color={colors.chartAmber}
                  detail={`${upload.length} host${upload.length !== 1 ? 's' : ''}`}
                />
              </div>

              {/* Tabla doble */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <HostTable
                  title="↓ Bajada (download)"
                  rows={download}
                  total={totalDown}
                  color={colors.chartGreen}
                  maxRows={maxRows}
                />
                <HostTable
                  title="↑ Subida (upload)"
                  rows={upload}
                  total={totalUp}
                  color={colors.chartAmber}
                  maxRows={maxRows}
                />
              </div>

              {/* Explicación */}
              <div
                className="rounded-[10px] p-4 text-[11px] leading-relaxed text-[#3c494c] dark:text-[#c0d4da]"
                style={{ backgroundColor: '#f4fafe', border: '1px solid #e9eff3', fontFamily: 'Space Grotesk, sans-serif' }}
              >
                <p className="font-bold uppercase tracking-[0.08em] mb-2 text-[#4d5e85]">
                  Cómo interpretar
                </p>
                <ul className="space-y-1 list-disc pl-4">
                  <li><b>Bajada</b>: bytes que la IP interna recibió de peers externos (descarga / consumo de internet).</li>
                  <li><b>Subida</b>: bytes que la IP interna envió a peers externos (uploads / sync con cloud / backups).</li>
                  <li>Una IP en el top de subida con bytes muy altos puede ser backup legítimo, sync de cloud storage, o un equipo comprometido exfiltrando data.</li>
                  <li>Los datos vienen de syslog Traffic Log del USG (flow_aggregates). Solo cuentan flujos con peer público (RFC1918 excluido del otro lado).</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function HostTable({
  title, rows, total, color, maxRows,
}: { title: string; rows: HostRow[]; total: number; color: string; maxRows: number }) {
  const max = Math.max(1, ...rows.map((r) => r.total_bytes))
  const padded: (HostRow | null)[] = [...rows]
  while (padded.length < Math.min(maxRows, 20)) padded.push(null)

  return (
    <div className="bg-white dark:bg-[#1e2528] rounded-[10px] p-4 border border-[#e9eff3] dark:border-[#252c2f]">
      <div className="flex items-center justify-between mb-3">
        <p
          className="text-[11px] font-bold uppercase tracking-[0.08em]"
          style={{ color, fontFamily: 'Space Grotesk, sans-serif' }}
        >
          {title}
        </p>
        <p
          className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          {formatBytes(total)} total
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] py-4 text-center">
          Sin datos
        </p>
      ) : (
        <ul className="space-y-1.5">
          {padded.map((r, i) => {
            if (!r) {
              return <li key={`empty-${i}`} className="h-[26px]" />
            }
            const pct = total > 0 ? (r.total_bytes / total) * 100 : 0
            const barPct = (r.total_bytes / max) * 100
            return (
              <li key={r.host} className="relative">
                <div className="flex items-center justify-between gap-3 text-[11px] mb-0.5">
                  <span
                    className="font-mono truncate text-[#161c1f] dark:text-[#ecf2f6]"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    title={r.host}
                  >
                    {i + 1}. {r.host}
                  </span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className="font-bold"
                      style={{ color, fontFamily: 'JetBrains Mono, monospace' }}
                    >
                      {formatBytes(r.total_bytes)}
                    </span>
                    <span className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] w-10 text-right">
                      {pct.toFixed(1)}%
                    </span>
                  </span>
                </div>
                <div className="h-1 rounded-full bg-[#eef4f8] dark:bg-[#252c2f] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${barPct}%`, backgroundColor: color }}
                  />
                </div>
                <p className="text-[9px] text-[#4d5e85] dark:text-[#a8c4cc] mt-0.5">
                  {formatNumber(r.total_packets)} paquetes
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function SummaryCard({
  icon: Icon, label, value, color, detail,
}: { icon: any; label: string; value: string; color: string; detail?: string }) {
  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[10px] p-3 border border-[#e9eff3] dark:border-[#252c2f]"
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon size={12} style={{ color }} strokeWidth={2} />
        <p
          className="text-[9px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          {label}
        </p>
      </div>
      <p
        className="text-[18px] font-bold leading-none"
        style={{ color, fontFamily: 'Space Grotesk, sans-serif' }}
      >
        {value}
      </p>
      {detail && (
        <p
          className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] mt-1"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          {detail}
        </p>
      )}
    </div>
  )
}
