import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

import { api } from '../../api/client'
import { colors } from '../../theme/colors'
import { ensureWorldMap } from '../../utils/worldMap'
import { useThemeStore } from '../../stores/themeStore'
import { formatBytes } from '../../utils/format'

const RANGES = ['1h', '24h', '7d', '15d', '30d'] as const
type Range = (typeof RANGES)[number]

interface Props {
  range?: Range
}

export function GeoMap({ range: initial = '1h' }: Props) {
  const [range, setRange] = useState<Range>(initial)
  const [points, setPoints] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const isDark = useThemeStore((s) => s.isDark)

  useEffect(() => {
    ensureWorldMap()
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    async function load() {
      try {
        const r = await api.geoExternal(range, 100)
        if (cancelled) return
        setPoints(r.points)
        setLoading(false)
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

  const max = Math.max(1, ...points.map((p) => p.bytes))

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const d = params.data
        if (!d) return ''
        return `<b>${d.country ?? '?'}</b>${d.city ? ` · ${d.city}` : ''}<br/>` +
          `${d.ip}<br/>` +
          `${formatBytes(d.bytes)}` +
          (d.isp ? `<br/>${d.isp}` : '')
      },
    },
    geo: {
      map: 'world',
      roam: true,
      itemStyle: {
        areaColor: isDark ? '#252c2f' : '#eef4f8',
        borderColor: isDark ? '#1e2528' : '#dde3e7',
        borderWidth: 0.5,
      },
      emphasis: {
        label: { show: false },
        itemStyle: { areaColor: isDark ? '#2b3134' : '#e3e9ed' },
      },
    },
    series: [
      {
        type: 'scatter',
        coordinateSystem: 'geo',
        symbolSize: (val: number[]) => {
          const v = Array.isArray(val) ? val[2] : 0
          return Math.max(5, Math.min(40, (v / max) * 40))
        },
        itemStyle: {
          color: colors.chartCyan,
          shadowBlur: 10,
          shadowColor: colors.chartCyan,
        },
        data: points.map((p) => ({
          name: p.ip,
          value: [p.lon, p.lat, p.bytes],
          ip: p.ip,
          country: p.country,
          city: p.city,
          bytes: p.bytes,
          isp: p.isp,
        })),
      },
    ],
  }

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p
          className="text-[12px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          Tráfico externo por geolocalización ({range})
        </p>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-[0.06em] transition-colors ${
                range === r
                  ? 'bg-[#006876] text-white'
                  : 'bg-[#eef4f8] dark:bg-[#252c2f] text-[#4d5e85] dark:text-[#a8c4cc] hover:bg-[#dde3e7] dark:hover:bg-[#2b3134]'
              }`}
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {loading && points.length === 0 ? (
        <div className="h-[400px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          Cargando mapa...
        </div>
      ) : points.length === 0 ? (
        <div className="h-[400px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8">
          Sin datos en este rango. Si NetFlow no está activo, los flows se derivan del syslog Traffic Log — necesita unos minutos de captura.
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: '480px', width: '100%' }} notMerge />
      )}
    </div>
  )
}
