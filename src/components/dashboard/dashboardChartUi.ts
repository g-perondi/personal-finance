import type { CSSProperties } from 'react'

/** Tooltip panel — matches slate panels (border-slate-800, bg-slate-900). */
export const dashboardChartTooltipContentStyle: CSSProperties = {
  backgroundColor: '#0f172a',
  border: '1px solid #475569',
  borderRadius: '0.5rem',
  padding: '0.5rem 0.75rem',
  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.45)',
}

export const dashboardChartTooltipLabelStyle: CSSProperties = {
  color: '#f1f5f9',
  fontWeight: 600,
  fontSize: 12,
  marginBottom: 4,
}

export const dashboardChartTooltipItemStyle: CSSProperties = {
  color: '#e2e8f0',
  fontSize: 12,
  lineHeight: '1.25rem',
}

/** Bar hover band — visible on dark chart area without washing out bars. */
export const dashboardBarChartTooltipCursor = {
  fill: 'rgba(71, 85, 105, 0.4)',
}

export const dashboardChartLegendWrapperStyle: CSSProperties = {
  color: '#94a3b8',
  fontSize: 12,
}
