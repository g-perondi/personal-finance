import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  DashboardChartSeriesPills,
  barFillOpacity,
  dashboardBarChartTooltipCursor,
  dashboardChartFontFamily,
  dashboardChartShellClassName,
  dashboardChartTooltipRenderer,
  formatChartYAxisEuro,
  preventChartMouseFocus,
  type DashboardChartSeries,
} from './dashboardChartUi'
import { amountChartColor } from '../../lib/amount-colors'

export type CashflowChartPoint = {
  label: string
  income: number
  expense: number
  investment: number
}

type CashflowChartWidgetProps = {
  title: string
  data: CashflowChartPoint[]
  emptyMessage?: string
  showInvestments?: boolean
}

const CASHFLOW_SERIES: DashboardChartSeries[] = [
  { dataKey: 'Income', label: 'Income', color: amountChartColor.inflow },
  { dataKey: 'Expenses', label: 'Expenses', color: amountChartColor.outflow },
  { dataKey: 'Investments', label: 'Investments', color: amountChartColor.investment },
]

function centsToEuro(value: number): number {
  return Math.round(value) / 100
}

export function CashflowChartWidget({
  title,
  data,
  emptyMessage = 'No cashflow data for this period.',
  showInvestments = true,
}: CashflowChartWidgetProps) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null)

  const cashflowSeries = useMemo(
    () =>
      showInvestments
        ? CASHFLOW_SERIES
        : CASHFLOW_SERIES.filter((series) => series.dataKey !== 'Investments'),
    [showInvestments],
  )

  const chartData = useMemo(
    () =>
      data.map((row) => ({
        name: row.label,
        Income: centsToEuro(row.income),
        Expenses: centsToEuro(row.expense),
        Investments: centsToEuro(row.investment),
      })),
    [data],
  )

  const tooltipContent = useMemo(
    () => dashboardChartTooltipRenderer(focusedKey, cashflowSeries),
    [focusedKey, cashflowSeries],
  )

  const hasData = chartData.some(
    (row) =>
      row.Income > 0 || row.Expenses > 0 || (showInvestments && row.Investments > 0),
  )

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">{title}</h3>
      {!hasData ? (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <>
          <DashboardChartSeriesPills
            series={cashflowSeries}
            focusedKey={focusedKey}
            onFocusChange={setFocusedKey}
          />
          <div
            className={dashboardChartShellClassName('h-64 w-full')}
            onMouseDown={preventChartMouseFocus}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                barCategoryGap="22%"
                barGap={4}
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
                  cursor={dashboardBarChartTooltipCursor}
                  isAnimationActive={false}
                  content={tooltipContent}
                />
                <Bar
                  dataKey="Income"
                  name="Income"
                  fill={amountChartColor.inflow}
                  fillOpacity={barFillOpacity('Income', focusedKey)}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  hide={focusedKey !== null && focusedKey !== 'Income'}
                />
                <Bar
                  dataKey="Expenses"
                  name="Expenses"
                  fill={amountChartColor.outflow}
                  fillOpacity={barFillOpacity('Expenses', focusedKey)}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  hide={focusedKey !== null && focusedKey !== 'Expenses'}
                />
                {showInvestments ? (
                  <Bar
                    dataKey="Investments"
                    name="Investments"
                    fill={amountChartColor.investment}
                    fillOpacity={barFillOpacity('Investments', focusedKey)}
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                    hide={focusedKey !== null && focusedKey !== 'Investments'}
                  />
                ) : null}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  )
}
