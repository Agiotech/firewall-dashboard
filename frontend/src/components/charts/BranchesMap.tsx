import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

import { api } from '../../api/client'
import { colors } from '../../theme/colors'
import { ensureWorldMap } from '../../utils/worldMap'
import { useThemeStore } from '../../stores/themeStore'

interface Branch {
  name: string
  peer_ip: string | null
  state: string | null
  country: string | null
  city: string | null
  lat: number | null
  lon: number | null
  isp: string | null
  health: string
}

const HEALTH_COLOR: Record<string, string> = {
  healthy: colors.chartGreen,
  stale: colors.chartAmber,
  down: colors.chartRed,
  unknown: colors.textGhost,
}

export function BranchesMap() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const isDark = useThemeStore((s) => s.isDark)

  useEffect(() => {
    ensureWorldMap()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await api.geoBranches()
        if (!cancelled) {
          setBranches(r.data)
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
  }, [])

  const located = branches.filter((b) => b.lat != null && b.lon != null)
  const unlocated = branches.length - located.length

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const d = params.data
        if (!d) return ''
        return `<b>${d.name}</b><br/>${d.country ?? ''}${d.city ? ` · ${d.city}` : ''}<br/>` +
          `peer ${d.peer_ip}<br/>health ${d.health}` +
          (d.isp ? `<br/>${d.isp}` : '')
      },
    },
    geo: {
      map: 'world',
      roam: true,
      zoom: 4,
      center: [-95, 23],  // Mexico-centered by default
      itemStyle: {
        areaColor: isDark ? '#252c2f' : '#eef4f8',
        borderColor: isDark ? '#1e2528' : '#dde3e7',
        borderWidth: 0.5,
      },
    },
    series: [
      {
        type: 'effectScatter',
        coordinateSystem: 'geo',
        symbolSize: 14,
        rippleEffect: { brushType: 'stroke', period: 5 },
        data: located.map((b) => ({
          ...b,
          name: b.name,
          value: [b.lon, b.lat, 1],
          itemStyle: { color: HEALTH_COLOR[b.health] ?? colors.textGhost },
        })),
      },
    ],
  }

  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <p
          className="text-[12px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          Mapa de sucursales VPN
        </p>
        <p className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc]">
          {located.length} ubicadas{unlocated > 0 ? ` · ${unlocated} sin GeoIP` : ''}
        </p>
      </div>
      {loading ? (
        <div className="h-[400px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          Cargando...
        </div>
      ) : located.length === 0 ? (
        <div className="h-[400px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8">
          Aún no hay túneles con peer IP resuelto. Aparecen conforme llegan eventos IPSec y GeoIP los enriquece.
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: '420px', width: '100%' }} notMerge />
      )}
    </div>
  )
}
