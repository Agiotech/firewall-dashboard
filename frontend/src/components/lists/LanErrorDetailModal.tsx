import { useEffect, useState } from 'react'
import type { EChartsOption } from 'echarts'
import { X, ArrowDown, ArrowUp, Activity } from 'lucide-react'

import { BaseChart } from '../charts/BaseChart'
import { api } from '../../api/client'
import { colors } from '../../theme/colors'

interface Props {
  port: string | null
  bucketTs: number | null
  onClose: () => void
}

interface DetailPoint {
  ts: number
  errors_in: number
  errors_out: number
  oper_status: number
  bps_in: number
  bps_out: number
}

const RANGES = [
  { v: '1h', label: '1h' },
  { v: '6h', label: '6h' },
  { v: '24h', label: '24h' },
  { v: '7d', label: '7d' },
] as const

export function LanErrorDetailModal({ port, bucketTs, onClose }: Props) {
  const [data, setData] = useState<DetailPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [range, setRange] = useState<typeof RANGES[number]['v']>('24h')

  useEffect(() => {
    if (!port) return
    let cancelled = false
    setLoading(true)
    api.lanErrorsDetail(port, range).then((r) => {
      if (!cancelled) {
        setData(r.data)
        setLoading(false)
      }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [port, range])

  if (!port) return null

  // Stats for the highlighted bucket (if provided)
  const bucketStart = bucketTs ?? 0
  const bucketEnd = bucketStart + 600
  const bucketSamples = data.filter((d) => d.ts >= bucketStart && d.ts < bucketEnd)
  const bucketInAvg = bucketSamples.length ? bucketSamples.reduce((s, d) => s + d.errors_in, 0) / bucketSamples.length : 0
  const bucketOutAvg = bucketSamples.length ? bucketSamples.reduce((s, d) => s + d.errors_out, 0) / bucketSamples.length : 0
  const bucketInMax = bucketSamples.length ? Math.max(...bucketSamples.map((d) => d.errors_in)) : 0
  const bucketOutMax = bucketSamples.length ? Math.max(...bucketSamples.map((d) => d.errors_out)) : 0

  // Time series option
  const option: EChartsOption = {
    title: { text: `Errores en tiempo real — ${port}`, left: 0, textStyle: { fontSize: 14 } },
    legend: { top: 0, right: 60, itemWidth: 10, itemHeight: 10 },
    grid: { top: 40, right: 16, bottom: 40, left: 50, containLabel: true },
    xAxis: { type: 'time' },
    yAxis: [
      { type: 'value', name: 'err/s', axisLabel: { fontSize: 9 } },
      { type: 'value', name: 'bps', axisLabel: { fontSize: 9 }, splitLine: { show: false } },
    ],
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        if (!Array.isArray(params)) params = [params]
        const ts = params[0]?.value?.[0]
        const date = ts ? new Date(ts).toLocaleString('es-MX') : ''
        return `<b>${date}</b><br/>` + params.map((p: any) => `${p.marker} ${p.seriesName}: ${(p.value[1]).toFixed(3)}`).join('<br/>')
      },
    },
    series: [
      {
        name: '↓ Errores in/s',
        type: 'line', smooth: true, showSymbol: false,
        yAxisIndex: 0,
        lineStyle: { width: 2, color: colors.chartRed },
        areaStyle: { color: colors.chartRed, opacity: 0.12 },
        data: data.map((d) => [d.ts * 1000, d.errors_in]),
      },
      {
        name: '↑ Errores out/s',
        type: 'line', smooth: true, showSymbol: false,
        yAxisIndex: 0,
        lineStyle: { width: 2, color: colors.chartAmber },
        areaStyle: { color: colors.chartAmber, opacity: 0.10 },
        data: data.map((d) => [d.ts * 1000, d.errors_out]),
      },
      {
        name: 'Tráfico total (bps)',
        type: 'line', smooth: true, showSymbol: false,
        yAxisIndex: 1,
        lineStyle: { width: 1, color: colors.chartIndigo, type: 'dashed', opacity: 0.6 },
        data: data.map((d) => [d.ts * 1000, d.bps_in + d.bps_out]),
      },
    ],
    ...(bucketTs ? {
      visualMap: [{
        show: false,
        seriesIndex: [0, 1],
        pieces: [{ min: bucketStart * 1000, max: bucketEnd * 1000 }],
        outOfRange: { opacity: 0.4 },
      }],
    } : {}),
  }

  const totalErrIn = data.reduce((s, d) => s + d.errors_in, 0)
  const totalErrOut = data.reduce((s, d) => s + d.errors_out, 0)

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
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eff3] dark:border-[#252c2f] sticky top-0 bg-white dark:bg-[#1e2528] z-10">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-[10px] flex items-center justify-center"
              style={{ backgroundColor: colors.chartRed + '1a' }}
            >
              <Activity size={18} style={{ color: colors.chartRed }} strokeWidth={1.8} />
            </div>
            <div>
              <p
                className="text-[16px] font-bold text-[#161c1f] dark:text-[#ecf2f6]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Errores en {port}
              </p>
              <p className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
                Detalle de paquetes con error reportados vía SNMP (ifInErrors + ifOutErrors)
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
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="rounded-full p-1 hover:bg-[#eef4f8] dark:hover:bg-[#252c2f]">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Stats del bucket clickeado */}
          {bucketTs && bucketSamples.length > 0 && (
            <div
              className="rounded-[10px] p-4"
              style={{ backgroundColor: colors.chartRed + '0d', border: `1px solid ${colors.chartRed}33` }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-[0.10em] mb-2"
                style={{ color: colors.chartRed, fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Bucket seleccionado · {new Date(bucketStart * 1000).toLocaleString('es-MX')}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                <Stat label="↓ in (promedio)" value={`${bucketInAvg.toFixed(3)} err/s`} color={colors.chartRed} />
                <Stat label="↓ in (pico)" value={`${bucketInMax.toFixed(2)} err/s`} color={colors.chartRed} />
                <Stat label="↑ out (promedio)" value={`${bucketOutAvg.toFixed(3)} err/s`} color={colors.chartAmber} />
                <Stat label="↑ out (pico)" value={`${bucketOutMax.toFixed(2)} err/s`} color={colors.chartAmber} />
              </div>
            </div>
          )}

          {/* Resumen del rango */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard
              icon={ArrowDown}
              label="Total errores in"
              value={totalErrIn.toFixed(1)}
              color={colors.chartRed}
            />
            <SummaryCard
              icon={ArrowUp}
              label="Total errores out"
              value={totalErrOut.toFixed(1)}
              color={colors.chartAmber}
            />
            <SummaryCard
              icon={Activity}
              label="Muestras"
              value={String(data.length)}
              color={colors.chartCyan}
            />
            <SummaryCard
              icon={Activity}
              label="Tiempo down"
              value={`${data.filter((d) => d.oper_status === 0).length * 30}s`}
              color={colors.chartIndigo}
            />
          </div>

          {/* Gráfica */}
          <div>
            {loading ? (
              <div className="h-[300px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
                Cargando…
              </div>
            ) : data.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
                Sin datos en este rango
              </div>
            ) : (
              <BaseChart option={option} height={320} />
            )}
          </div>

          {/* Explicación contextual */}
          <div
            className="rounded-[10px] p-4 text-[11px] leading-relaxed text-[#3c494c] dark:text-[#c0d4da]"
            style={{ backgroundColor: '#f4fafe', border: '1px solid #e9eff3', fontFamily: 'Space Grotesk, sans-serif' }}
          >
            <p className="font-bold uppercase tracking-[0.08em] mb-2 text-[#4d5e85]">
              Cómo interpretar
            </p>
            <ul className="space-y-1 list-disc pl-4">
              <li><b>↓ in</b>: paquetes que llegaron al puerto y se descartaron por error (CRC, runt, giant, alignment). Indica problema físico — cable, interferencia, EM, duplex mismatch.</li>
              <li><b>↑ out</b>: paquetes que no se pudieron transmitir. Causa típica: collision en half-duplex, buffer overflow por congestion.</li>
              <li><b>Wi-Fi (P13-WIFI / P12-WIFI-1)</b>: cierta cantidad de errores es normal por la naturaleza del medio (retransmisiones, interferencia). Picos sostenidos indican APs saturados o clientes con señal débil.</li>
              <li><b>Trunks (P5-Phones, P6-Product…)</b>: errores aquí casi siempre son cable o duplex mismatch. Reemplazar patch o forzar full-duplex 1G.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc]"
        style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
        {label}
      </p>
      <p className="font-bold mt-0.5"
        style={{ color, fontFamily: 'JetBrains Mono, monospace' }}>
        {value}
      </p>
    </div>
  )
}

function SummaryCard({
  icon: Icon, label, value, color,
}: { icon: any; label: string; value: string; color: string }) {
  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[10px] p-3 border border-[#e9eff3] dark:border-[#252c2f]"
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon size={11} style={{ color }} strokeWidth={2} />
        <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          {label}
        </p>
      </div>
      <p className="text-[18px] font-bold leading-none text-[#161c1f] dark:text-[#ecf2f6]"
        style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
        {value}
      </p>
    </div>
  )
}
