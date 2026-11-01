import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { WealthSeriesPoint } from '../../db/repositories/dashboard'
import {
  DashboardChartSeriesPills,
  dashboardChartFontFamily,
  dashboardChartShellClassName,
  dashboardChartTooltipRenderer,
  formatChartYAxisEuro,
  preventChartMouseFocus,
  seriesStrokeOpacity,
  seriesStrokeWidth,
  type DashboardChartSeries,
} from './dashboardChartUi'
import { wealthChartColor } from '../../lib/amount-colors'

type WealthChartWidgetProps = {
  title: string
  data: WealthSeriesPoint[]
  emptyMessage?: string
  className?: string
  showInvestments?: boolean
}

const WEALTH_SERIES: DashboardChartSeries[] = [
  { dataKey: 'Cash', label: 'Cash', color: wealthChartColor.cash },
  { dataKey: 'Investment', label: 'Investment', color: wealthChartColor.investment },
  { dataKey: 'Total', label: 'Total', color: wealthChartColor.total },
]

export function WealthChartWidget({
  title,
  data,
  emptyMessage = 'No wealth history yet.',
  className,
  showInvestments = true,
}: WealthChartWidgetProps) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null)

  const wealthSeries = useMemo(
    () =>
      showInvestments
        ? WEALTH_SERIES
        : WEALTH_SERIES.filter((series) => series.dataKey !== 'Investment'),
    [showInvestments],
  )

  const chartData = useMemo(
    () =>
      data.map((row) => ({
        name: row.label,
        Cash: row.cashCents / 100,
        Investment: row.investmentCents / 100,
        Total: showInvestments ? row.totalCents / 100 : row.cashCents / 100,
      })),
    [data, showInvestments],
  )
  const hasData = chartData.length > 0

  const tooltipContent = useMemo(
    () => dashboardChartTooltipRenderer(focusedKey, wealthSeries),
    [focusedKey, wealthSeries],
  )

  const sectionClass = [
    'flex flex-col rounded-xl border border-slate-800 bg-slate-900/30 p-4',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={sectionClass}>
      <h3 className="mb-2 shrink-0 text-sm font-semibold text-slate-200">{title}</h3>
      {!hasData ? (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <>
          <DashboardChartSeriesPills
            series={wealthSeries}
            focusedKey={focusedKey}
            onFocusChange={setFocusedKey}
          />
          <div
            className={dashboardChartShellClassName('min-h-0 w-full flex-1')}
            onMouseDown={preventChartMouseFocus}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#334155"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  fontFamily={dashboardChartFontFamily}
                  tickLine={false}
                  axisLine={{ stroke: '#475569' }}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  fontFamily={dashboardChartFontFamily}
                  tickFormatter={formatChartYAxisEuro}
                  tickLine={false}
                  axisLine={{ stroke: '#475569' }}
                  width={52}
                />
                <Tooltip
                  cursor={{
                    stroke: '#94a3b8',
                    strokeWidth: 1,
                    strokeDasharray: '4 4',
                  }}
                  isAnimationActive={false}
                  content={tooltipContent}
                />
                <Line
                  type="monotone"
                  dataKey="Cash"
                  name="Cash"
                  stroke={wealthChartColor.cash}
                  strokeWidth={seriesStrokeWidth('Cash', focusedKey)}
                  strokeOpacity={seriesStrokeOpacity('Cash', focusedKey)}
                  dot={false}
                  activeDot={{
                    r: 5,
                    strokeWidth: 2,
                    stroke: '#0f172a',
                    fill: wealthChartColor.cash,
                  }}
                  isAnimationActive={false}
                  hide={focusedKey !== null && focusedKey !== 'Cash'}
                />
                {showInvestments ? (
                  <Line
                    type="monotone"
                    dataKey="Investment"
                    name="Investment"
                    stroke={wealthChartColor.investment}
                    strokeWidth={seriesStrokeWidth('Investment', focusedKey)}
                    strokeOpacity={seriesStrokeOpacity('Investment', focusedKey)}
                    dot={false}
                    activeDot={{
                      r: 5,
                      strokeWidth: 2,
                      stroke: '#0f172a',
                      fill: wealthChartColor.investment,
                    }}
                    isAnimationActive={false}
                    hide={focusedKey !== null && focusedKey !== 'Investment'}
                  />
                ) : null}
                <Line
                  type="monotone"
                  dataKey="Total"
                  name="Total"
                  stroke={wealthChartColor.total}
                  strokeWidth={seriesStrokeWidth('Total', focusedKey)}
                  strokeOpacity={seriesStrokeOpacity('Total', focusedKey)}
                  dot={false}
                  activeDot={{
                    r: 5,
                    strokeWidth: 2,
                    stroke: '#0f172a',
                    fill: wealthChartColor.total,
                  }}
                  isAnimationActive={false}
                  hide={focusedKey !== null && focusedKey !== 'Total'}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  )
}
