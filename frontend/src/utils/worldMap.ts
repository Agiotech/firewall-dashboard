import * as echarts from 'echarts'
import { feature } from 'topojson-client'
import worldAtlas from 'world-atlas/countries-110m.json'

let registered = false

export function ensureWorldMap() {
  if (registered) return
  // topojson-client.feature returns a FeatureCollection that ECharts can accept as 'map'
  const geo = feature(worldAtlas as any, (worldAtlas as any).objects.countries) as any
  echarts.registerMap('world', geo)
  registered = true
}
