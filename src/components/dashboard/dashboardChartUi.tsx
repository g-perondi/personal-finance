import type { CSSProperties, ComponentProps, MouseEvent, ReactNode } from 'react'
import { type Tooltip } from 'recharts'
import type { TooltipContentProps } from 'recharts'

export const dashboardChartFontFamily = 'Inconsolata, ui-monospace, monospace'

export type DashboardChartSeries = {
  dataKey: string
  label: string
  color: string
}

/** Wrapper around Recharts — charts are read-only (no SVG focus ring). */
export function dashboardChartShellClassName(extra?: string): string {
  return ['dashboard-chart', extra].filter(Boolean).join(' ')
}

export function preventChartMouseFocus(event: MouseEvent<HTMLDivElement>): void {
  if (event.button === 0) {
    event.preventDefault()
  }
}

function seriesPillClass(active: boolean): string {
  return [
    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
    active
      ? 'border-slate-500 bg-slate-800 text-white'
      : 'border-slate-700/80 bg-slate-950/50 text-slate-400 hover:border-slate-600 hover:text-slate-200',
  ].join(' ')
}

type DashboardChartSeriesPillsProps = {
  series: DashboardChartSeries[]
  focusedKey: string | null
  onFocusChange: (dataKey: string | null) => void
}

export function DashboardChartSeriesPills({
  series,
  focusedKey,
  onFocusChange,
}: DashboardChartSeriesPillsProps) {
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Chart series"
    >
      <button
        type="button"
        className={seriesPillClass(focusedKey === null)}
        onClick={() => onFocusChange(null)}
      >
        All
      </button>
      {series.map((item) => {
        const active = focusedKey === item.dataKey
        return (
          <button
            key={item.dataKey}
            type="button"
            className={seriesPillClass(active)}
            onClick={() => onFocusChange(active ? null : item.dataKey)}
            aria-pressed={active}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export function formatChartEuro(value: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatChartYAxisEuro(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    return `€${(value / 1_000_000).toFixed(1)}M`
  }
  if (abs >= 10_000) {
    return `€${Math.round(value / 1_000)}k`
  }
  if (abs >= 1_000) {
    return `€${(value / 1_000).toFixed(1)}k`
  }
  return `€${Math.round(value)}`
}

export function seriesStrokeOpacity(
  dataKey: string,
  focusedKey: string | null,
): number {
  if (focusedKey === null) {
    return 1
  }
  return focusedKey === dataKey ? 1 : 0.15
}

export function seriesStrokeWidth(dataKey: string, focusedKey: string | null): number {
  if (focusedKey === null) {
    return dataKey === 'Total' ? 2.5 : 2
  }
  return focusedKey === dataKey ? 3 : 1.5
}

/** Tooltip panel — matches slate panels. */
export const dashboardChartTooltipContentStyle: CSSProperties = {
  backgroundColor: '#0f172a',
  border: '1px solid #475569',
  borderRadius: '0.5rem',
  padding: '0.5rem 0.75rem',
  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.45)',
  fontFamily: dashboardChartFontFamily,
}

export const dashboardChartTooltipLabelStyle: CSSProperties = {
  color: '#f1f5f9',
  fontFamily: dashboardChartFontFamily,
  fontWeight: 600,
  fontSize: 12,
  marginBottom: 6,
}

export const dashboardChartTooltipItemStyle: CSSProperties = {
  color: '#e2e8f0',
  fontFamily: dashboardChartFontFamily,
  fontSize: 12,
  lineHeight: '1.35rem',
  padding: 0,
}

export const dashboardBarChartTooltipCursor = {
  fill: 'rgba(71, 85, 105, 0.35)',
  stroke: 'rgba(148, 163, 184, 0.35)',
  strokeWidth: 1,
}

export type DashboardChartTooltipPayload = TooltipContentProps<number, string>

type DashboardChartTooltipProps = DashboardChartTooltipPayload & {
  focusedKey: string | null
  series: DashboardChartSeries[]
}

export function DashboardChartTooltip({
  active,
  payload,
  label,
  focusedKey,
  series,
}: DashboardChartTooltipProps): ReactNode {
  if (!active || !payload?.length) {
    return null
  }

  const colorByKey = new Map(series.map((s) => [s.dataKey, s.color]))
  const rows =
    focusedKey === null
      ? payload
      : payload.filter((entry) => entry.dataKey === focusedKey)

  if (rows.length === 0) {
    return null
  }

  return (
    <div style={dashboardChartTooltipContentStyle}>
      {label ? <p style={dashboardChartTooltipLabelStyle}>{label}</p> : null}
      <ul className="m-0 list-none space-y-1 p-0">
        {rows.map((entry) => {
          const key = String(entry.dataKey ?? '')
          const color = colorByKey.get(key) ?? entry.color ?? '#e2e8f0'
          const value = Number(entry.value)
          return (
            <li
              key={key}
              className="flex items-center justify-between gap-4 tabular-nums"
              style={dashboardChartTooltipItemStyle}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                {entry.name ?? key}
              </span>
              <span className="font-medium text-white">{formatChartEuro(value)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function barFillOpacity(dataKey: string, focusedKey: string | null): number {
  return seriesStrokeOpacity(dataKey, focusedKey)
}

type RechartsTooltipContent = NonNullable<ComponentProps<typeof Tooltip>['content']>

export function dashboardChartTooltipRenderer(
  focusedKey: string | null,
  series: DashboardChartSeries[],
): RechartsTooltipContent {
  function RenderDashboardChartTooltip(props: TooltipContentProps<number, string>) {
    return <DashboardChartTooltip {...props} focusedKey={focusedKey} series={series} />
  }
  return RenderDashboardChartTooltip as RechartsTooltipContent
}
