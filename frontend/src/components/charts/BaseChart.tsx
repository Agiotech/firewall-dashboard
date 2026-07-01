import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { useThemeStore } from '../../stores/themeStore'
import { agiotechTheme, agiotechThemeLight } from '../../theme/echarts-agiotech'

interface BaseChartProps {
  option: EChartsOption
  height?: number
  className?: string
  noZoom?: boolean
}

export const TOOLBOX = {
  show: true,
  right: 0,
  top: 0,
  itemSize: 13,
  feature: {
    dataZoom: {
      yAxisIndex: 'none' as const,
      title: { zoom: 'Seleccionar área', back: 'Deshacer' },
    },
    restore: { title: 'Restablecer' },
  },
} satisfies EChartsOption['toolbox']

export function BaseChart({ option, height = 280, className = '', noZoom = false }: BaseChartProps) {
  const isDark = useThemeStore((s) => s.isDark)
  const theme = isDark ? agiotechTheme : agiotechThemeLight

  const mergedOption: EChartsOption = {
    ...option,
    backgroundColor: 'transparent',
    textStyle: theme.textStyle,
    tooltip: { ...theme.tooltip, trigger: 'axis', ...(option.tooltip ?? {}) } as EChartsOption['tooltip'],
    legend: { ...theme.legend, ...(option.legend ?? {}) } as EChartsOption['legend'],
    grid: {
      top: 40,
      right: 20,
      bottom: noZoom ? 30 : 50,
      left: 50,
      containLabel: true,
      ...(option.grid ?? {}),
    },
    toolbox: noZoom ? undefined : { ...TOOLBOX, ...(option.toolbox ?? {}) },
    dataZoom: noZoom
      ? undefined
      : [
          { type: 'inside' as const },
          {
            type: 'slider' as const,
            bottom: 4,
            height: 16,
            borderColor: 'transparent',
            fillerColor: 'rgba(0,182,204,0.12)',
            handleStyle: { color: '#00b6cc' },
            dataBackground: {
              lineStyle: { color: 'rgba(0,182,204,0.3)' },
              areaStyle: { color: 'rgba(0,182,204,0.05)' },
            },
          },
          ...(Array.isArray(option.dataZoom) ? option.dataZoom : []),
        ],
  }

  return (
    <ReactECharts
      option={mergedOption}
      style={{ height: `${height}px`, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      className={className}
      notMerge
    />
  )
}
