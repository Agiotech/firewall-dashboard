import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

import { api } from '../../api/client'
import { useThemeStore } from '../../stores/themeStore'
import { LanErrorDetailModal } from '../lists/LanErrorDetailModal'

interface HeatRow {
  port_name: string
  bucket_ts: number
  errs: number
  errs_in_avg: number
  errs_out_avg: number
  errs_in_max: number
  errs_out_max: number
  samples: number
}

interface HeatData {
  ports: string[]
  buckets: number[]
  data: HeatRow[]
  bucket_s: number
}

export function LanErrorsHeatmap({ range = '24h' }: { range?: string }) {
  const [data, setData] = useState<HeatData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<{ port: string; bucketTs: number } | null>(null)
  const isDark = useThemeStore((s) => s.isDark)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await api.lanErrorsHeatmap(range)
        if (!cancelled) { setData(r); setLoading(false) }
      } catch { if (!cancelled) setLoading(false) }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [range])

  const cells = data ? data.data.map((d) => {
    const xi = data.buckets.indexOf(d.bucket_ts)
    const yi = data.ports.indexOf(d.port_name)
    return {
      value: [xi, yi, d.errs],
      port_name: d.port_name,
      bucket_ts: d.bucket_ts,
      errs_in_avg: d.errs_in_avg,
      errs_out_avg: d.errs_out_avg,
      errs_in_max: d.errs_in_max,
      errs_out_max: d.errs_out_max,
      samples: d.samples,
    }
  }) : []
  const max = Math.max(1, ...(data?.data ?? []).map((d) => d.errs))

  const option: EChartsOption = data ? {
    title: { text: 'Mapa de errores por puerto LAN (click para detalle)', left: 0 },
    grid: { top: 40, right: 10, bottom: 40, left: 100, containLabel: true },
    xAxis: {
      type: 'category',
      data: data.buckets.map((b) => new Date(b * 1000).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })),
      axisLabel: { fontSize: 9, interval: Math.floor(data.buckets.length / 12) },
    },
    yAxis: { type: 'category', data: data.ports, axisLabel: { fontSize: 11 } },
    tooltip: {
      formatter: (params: any) => {
        const d = params.data
        const port = d.port_name
        const ts = new Date(d.bucket_ts * 1000).toLocaleString('es-MX')
        const isWifi = port.toLowerCase().includes('wifi')
        const wifiHint = isWifi
          ? '<br/><span style="color:#4d5e85;font-size:9px;">↳ En Wi-Fi cierta cantidad es normal (retransmisiones aéreas)</span>'
          : ''
        return [
          `<b>${port}</b> · ${ts}`,
          `<span style="color:#EF5350;">↓ in</span>: ${d.errs_in_avg.toFixed(3)} err/s (pico ${d.errs_in_max.toFixed(2)})`,
          `<span style="color:#FFA726;">↑ out</span>: ${d.errs_out_avg.toFixed(3)} err/s (pico ${d.errs_out_max.toFixed(2)})`,
          `<span style="color:#4d5e85;font-size:9px;">${d.samples} muestras en este bucket</span>`,
          `<span style="color:#006876;font-size:10px;font-weight:bold;">Click para drill-down</span>${wifiHint}`,
        ].join('<br/>')
      },
    },
    visualMap: {
      show: false,
      min: 0, max,
      inRange: { color: isDark ? ['#1e2528', '#26A69A', '#FFA726', '#EF5350'] : ['#eef4f8', '#26A69A', '#FFA726', '#EF5350'] },
    },
    series: [{
      type: 'heatmap',
      data: cells,
      itemStyle: { borderRadius: 2 },
      emphasis: { itemStyle: { borderWidth: 2, borderColor: '#006876' } },
    }],
  } : { title: { text: '' } }

  function onEvents() {
    return {
      click: (params: any) => {
        const d = params?.data
        if (!d?.port_name) return
        setSelected({ port: d.port_name, bucketTs: d.bucket_ts })
      },
    }
  }

  return (
    <>
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        {loading ? (
          <div className="h-[260px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">Cargando...</div>
        ) : !data || data.data.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8">
            Sin errores en puertos LAN en este rango. Sano.
          </div>
        ) : (
          <ReactECharts
            option={option}
            style={{ height: `${Math.max(180, data.ports.length * 32 + 80)}px`, width: '100%' }}
            notMerge
            onEvents={onEvents()}
          />
        )}
      </div>
      <LanErrorDetailModal
        port={selected?.port ?? null}
        bucketTs={selected?.bucketTs ?? null}
        onClose={() => setSelected(null)}
      />
    </>
  )
}
