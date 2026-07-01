import { useEffect, useState, useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { AlertOctagon, Globe2, Radar, ShieldAlert, Volume2, FileSpreadsheet } from 'lucide-react'

import { BaseChart } from './BaseChart'
import { api } from '../../api/client'
import { colors } from '../../theme/colors'

type Category = 'attack' | 'scan' | 'service' | 'noise'

interface Attack {
  src_ip: string
  attempts: number
  distinct_ports: number
  first_seen: number
  last_seen: number
  score: number
  category: Category
  category_reason: string
  top_ports: { dst_port: number; n: number }[]
  country: string | null
  country_code: string | null
  city: string | null
  isp: string | null
}

interface TimelinePoint {
  bucket_ts: number
  attempts: number
  distinct_attackers: number
}

type Filter = 'all' | 'real' | 'attack' | 'scan' | 'service' | 'noise'

const CATEGORY_META: Record<Category, { color: string; label: string; Icon: typeof AlertOctagon }> = {
  attack: { color: colors.chartRed, label: 'ATAQUE', Icon: ShieldAlert },
  scan: { color: colors.chartAmber, label: 'ESCANEO', Icon: Radar },
  service: { color: colors.chartPurple, label: 'SERVICIO', Icon: AlertOctagon },
  noise: { color: colors.textGhost, label: 'RUIDO', Icon: Volume2 },
}

export function AttackTimeline({ range = '24h' }: { range?: string }) {
  const [attacks, setAttacks] = useState<Attack[]>([])
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [summary, setSummary] = useState<{ attack: number; scan: number; service: number; noise: number } | null>(null)
  const [filter, setFilter] = useState<Filter>('real')
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  async function downloadBlocklist() {
    if (downloading) return
    setDownloading(true)
    setProgress(0)
    setDownloadError(null)
    try {
      const cat = filter === 'all' ? 'all' : filter === 'noise' ? 'noise' : filter === 'attack' || filter === 'scan' || filter === 'service' ? filter : 'real'
      const url = `/api/security/blocklist/export?range=${range}&category=${cat}&min_attempts=0`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const totalRaw = response.headers.get('content-length')
      const total = totalRaw ? parseInt(totalRaw, 10) : 0
      const reader = response.body?.getReader()
      if (!reader) throw new Error('streaming no soportado')

      const chunks: Uint8Array[] = []
      let received = 0
      let lastUiUpdate = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          received += value.length
          if (total > 0) {
            const now = performance.now()
            if (now - lastUiUpdate > 50) {
              setProgress(Math.min(99, (received / total) * 100))
              lastUiUpdate = now
            }
          } else {
            // No content-length — show indeterminate (kb received)
            setProgress(-1)
          }
        }
      }

      const blob = new Blob(chunks as BlobPart[], {
        type: response.headers.get('content-type') ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const cd = response.headers.get('content-disposition') ?? ''
      const m = cd.match(/filename\*?="?([^";]+)"?/i)
      const filename = m ? decodeURIComponent(m[1]) : `blocklist-${cat}.xlsx`

      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // Small delay so the browser shows the save dialog before we revoke
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1500)

      setProgress(100)
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      // Keep the 100% bar visible briefly, then reset
      setTimeout(() => {
        setDownloading(false)
        setProgress(0)
      }, 600)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await api.securityAttacks(range, 100)
        if (!cancelled) {
          setAttacks(r.data)
          setTimeline(r.timeline)
          setSummary(r.summary)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [range])

  const filtered = useMemo(() => {
    if (filter === 'all') return attacks
    if (filter === 'real') return attacks.filter((a) => a.category !== 'noise')
    return attacks.filter((a) => a.category === filter)
  }, [attacks, filter])

  const lineOption: EChartsOption = {
    title: { text: 'Drops desde Internet — volumen', left: 0 },
    grid: { top: 36, right: 20, bottom: 30, left: 50 },
    xAxis: { type: 'time' },
    yAxis: [
      { type: 'value', name: 'Intentos', axisLabel: { fontSize: 9 } },
      { type: 'value', name: 'IPs distintas', axisLabel: { fontSize: 9 }, splitLine: { show: false } },
    ],
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 60, itemWidth: 10, itemHeight: 10 },
    series: [
      {
        name: 'Intentos',
        type: 'bar',
        yAxisIndex: 0,
        barMaxWidth: 12,
        itemStyle: { color: colors.chartRed + '99' },
        data: timeline.map((t) => [t.bucket_ts * 1000, t.attempts]),
      },
      {
        name: 'IPs distintas',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: colors.chartAmber },
        data: timeline.map((t) => [t.bucket_ts * 1000, t.distinct_attackers]),
      },
    ],
  }

  return (
    <div className="space-y-4">
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        {timeline.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
            {loading ? 'Cargando...' : 'Sin drops registrados en este rango'}
          </div>
        ) : (
          <BaseChart option={lineOption} height={220} />
        )}
      </div>

      <div
        className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <p
              className="text-[12px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Atacantes clasificados
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={downloadBlocklist}
                disabled={downloading}
                className="relative inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] rounded-[8px] text-white overflow-hidden disabled:cursor-wait min-w-[170px] justify-center"
                style={{
                  backgroundColor: downloading ? colors.chartBlue : colors.chartCyan,
                  fontFamily: 'Space Grotesk, sans-serif',
                  opacity: downloading ? 0.92 : 1,
                }}
                title={downloading ? 'Descargando…' : 'Descargar blocklist como Excel listo para aplicar en el USG'}
              >
                {downloading && progress >= 0 && (
                  <span
                    className="absolute inset-y-0 left-0 transition-all duration-150"
                    style={{
                      width: `${progress}%`,
                      backgroundColor: 'rgba(255,255,255,0.25)',
                    }}
                  />
                )}
                {downloading && progress < 0 && (
                  <span
                    className="absolute inset-y-0 w-1/3 animate-[indeterminate_1.2s_linear_infinite]"
                    style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}
                  />
                )}
                <span className="relative flex items-center gap-1.5 z-10">
                  <FileSpreadsheet
                    size={12}
                    strokeWidth={2.5}
                    className={downloading ? 'animate-pulse' : ''}
                  />
                  {downloading
                    ? progress >= 0
                      ? `Descargando ${progress.toFixed(0)}%`
                      : 'Descargando…'
                    : 'Exportar a Excel'}
                </span>
              </button>
              {downloadError && (
                <span
                  className="text-[10px] font-bold"
                  style={{ color: colors.chartRed, fontFamily: 'Space Grotesk, sans-serif' }}
                  title={downloadError}
                >
                  ⚠ {downloadError.substring(0, 40)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 bg-[#eef4f8] dark:bg-[#252c2f] rounded-[8px] p-0.5 flex-wrap">
            {(['real', 'attack', 'scan', 'service', 'noise', 'all'] as const).map((f) => {
              const labels: Record<Filter, string> = {
                real: `Reales (${(summary?.attack ?? 0) + (summary?.scan ?? 0) + (summary?.service ?? 0)})`,
                attack: `Ataques (${summary?.attack ?? 0})`,
                scan: `Scans (${summary?.scan ?? 0})`,
                service: `Servicio (${summary?.service ?? 0})`,
                noise: `Ruido (${summary?.noise ?? 0})`,
                all: 'Todos',
              }
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-[6px] ${
                    filter === f
                      ? 'bg-white dark:bg-[#1e2528] text-[#161c1f] dark:text-[#ecf2f6]'
                      : 'text-[#4d5e85] dark:text-[#a8c4cc]'
                  }`}
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  {labels[f]}
                </button>
              )
            })}
          </div>
        </div>

        {filter === 'real' && (
          <p className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] mb-2">
            Vista por defecto: oculta el "ruido" (probable tráfico de retorno / NAT expirado). Ver tab "Ruido" para entender qué se filtra.
          </p>
        )}

        {filtered.length === 0 ? (
          <p className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] py-4 text-center">
            Sin entradas en esta categoría.
          </p>
        ) : (
          <div className="overflow-auto max-h-[460px]">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-white dark:bg-[#1e2528]">
                <tr className="border-b border-[#e9eff3] dark:border-[#252c2f]">
                  {['Categoría', 'IP', 'Origen', 'Intentos', 'Puertos', 'Top puertos', 'Última'].map((h) => (
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
                {filtered.map((a, i) => {
                  const meta = CATEGORY_META[a.category] ?? CATEGORY_META.noise
                  const Icon = meta.Icon
                  return (
                    <tr
                      key={a.src_ip}
                      className={`border-b border-[#e9eff3] dark:border-[#252c2f] ${i % 2 === 1 ? 'bg-[#f8fafc] dark:bg-[#252c2f]' : ''}`}
                      title={a.category_reason}
                    >
                      <td className="py-1.5 px-2">
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                          style={{ backgroundColor: meta.color + '22', color: meta.color, fontFamily: 'Space Grotesk, sans-serif' }}
                        >
                          <Icon size={10} strokeWidth={2.5} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-1.5 px-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {a.src_ip}
                      </td>
                      <td className="py-1.5 px-2 text-[#3c494c] dark:text-[#c0d4da]">
                        <span className="flex items-center gap-1">
                          {a.country_code && <Globe2 size={10} className="text-[#4d5e85] dark:text-[#a8c4cc]" />}
                          <span>{a.country_code ?? '?'}</span>
                          {a.city && <span className="text-[#4d5e85] dark:text-[#a8c4cc]"> · {a.city}</span>}
                        </span>
                        {a.isp && (
                          <p className="text-[9px] text-[#4d5e85] dark:text-[#a8c4cc] truncate max-w-[200px]">
                            {a.isp}
                          </p>
                        )}
                      </td>
                      <td className="py-1.5 px-2 font-bold text-[#161c1f] dark:text-[#ecf2f6]">
                        {a.attempts.toLocaleString('es-MX')}
                      </td>
                      <td className="py-1.5 px-2">
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold"
                          style={{ color: meta.color, backgroundColor: meta.color + '22' }}
                        >
                          {a.distinct_ports}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-[#3c494c] dark:text-[#c0d4da]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {a.top_ports.slice(0, 4).map((p) => `${p.dst_port}(${p.n})`).join(', ')}
                      </td>
                      <td className="py-1.5 px-2 text-[#4d5e85] dark:text-[#a8c4cc]">
                        {new Date(a.last_seen * 1000).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
