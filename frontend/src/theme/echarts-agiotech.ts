export const CHART_COLORS = [
  '#006876', '#00b6cc', '#4d5e85', '#4bd8ee',
  '#26A69A', '#FFA726', '#EF5350', '#66BB6A',
  '#AB47BC', '#FF7043',
] as const

const baseTheme = {
  color: [...CHART_COLORS],
  backgroundColor: 'transparent',
}

const axisBase = {
  axisTick: { show: false },
  axisLine: { show: false },
}

export const agiotechThemeLight = {
  ...baseTheme,
  textStyle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 11,
    color: '#3c494c',
  },
  title: {
    textStyle: {
      fontFamily: 'Space Grotesk, sans-serif',
      fontWeight: 700,
      fontSize: 16,
      color: '#161c1f',
    },
  },
  categoryAxis: {
    ...axisBase,
    axisLabel: {
      fontFamily: 'Inter, sans-serif',
      fontSize: 9,
      fontWeight: 700,
      color: '#4d5e85',
    },
    splitLine: { show: false },
  },
  valueAxis: {
    ...axisBase,
    axisLabel: {
      fontFamily: 'Inter, sans-serif',
      fontSize: 9,
      color: '#4d5e85',
    },
    splitLine: {
      lineStyle: { color: 'rgba(187,201,204,0.15)', type: 'dashed' as const },
    },
  },
  tooltip: {
    backgroundColor: '#ffffff',
    borderColor: 'transparent',
    borderWidth: 0,
    textStyle: { color: '#161c1f', fontSize: 12, fontFamily: 'Inter, sans-serif' },
    extraCssText: 'border-radius: 12px; box-shadow: 0px 12px 32px rgba(9,29,65,0.10);',
  },
  legend: {
    textStyle: {
      fontFamily: 'Inter, sans-serif',
      fontSize: 10,
      fontWeight: 700,
      color: '#4d5e85',
    },
  },
}

export const agiotechTheme = {
  ...agiotechThemeLight,
  textStyle: { ...agiotechThemeLight.textStyle, color: '#c0d4da' },
  title: {
    textStyle: { ...agiotechThemeLight.title.textStyle, color: '#ecf2f6' },
  },
  categoryAxis: {
    ...agiotechThemeLight.categoryAxis,
    axisLabel: { ...agiotechThemeLight.categoryAxis.axisLabel, color: '#a8c4cc' },
  },
  valueAxis: {
    ...agiotechThemeLight.valueAxis,
    axisLabel: { ...agiotechThemeLight.valueAxis.axisLabel, color: '#a8c4cc' },
    splitLine: { lineStyle: { color: 'rgba(168,196,204,0.15)', type: 'dashed' as const } },
  },
  tooltip: {
    ...agiotechThemeLight.tooltip,
    backgroundColor: '#1e2528',
    textStyle: { ...agiotechThemeLight.tooltip.textStyle, color: '#ecf2f6' },
  },
  legend: {
    textStyle: { ...agiotechThemeLight.legend.textStyle, color: '#a8c4cc' },
  },
}
