export const chartPalette = {
  ink: '#303733',
  sidebar: '#242a26',
  progress: '#d2b796',
  terracotta: '#b5534b',
  bronze: '#9a8060',
  sage: '#66816f',
  slate: '#687f91',
  ochre: '#b18a43',
  plum: '#74677e',
  moss: '#7f8f69',
  sand: '#b49a78',
} as const

export const distributionChartColors = [
  chartPalette.sidebar,
  chartPalette.progress,
  chartPalette.terracotta,
  chartPalette.sage,
  chartPalette.ochre,
  chartPalette.slate,
  chartPalette.plum,
  chartPalette.bronze,
  chartPalette.moss,
] as const
