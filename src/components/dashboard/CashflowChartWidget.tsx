import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  dashboardChartFontFamily,
  dashboardBarChartTooltipCursor,
  dashboardChartLegendWrapperStyle,
  dashboardChartTooltipContentStyle,
  dashboardChartTooltipItemStyle,
  dashboardChartTooltipLabelStyle,
} from './dashboardChartUi'

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
}

function centsToEuro(value: number): number {
  return Math.round(value) / 100
}

export function CashflowChartWidget({
  title,
  data,
  emptyMessage = 'No cashflow data for this period.',
}: CashflowChartWidgetProps) {
  const chartData = data.map((row) => ({
    name: row.label,
    Income: centsToEuro(row.income),
    Expenses: centsToEuro(row.expense),
    Investments: centsToEuro(row.investment),
  }))
  const hasData = chartData.some(
    (row) => row.Income > 0 || row.Expenses > 0 || row.Investments > 0,
  )

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
      <h3 className="mb-4 text-sm font-semibold text-slate-200">{title}</h3>
      {!hasData ? (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="name"
                stroke="#94a3b8"
                fontSize={12}
                fontFamily={dashboardChartFontFamily}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={12}
                fontFamily={dashboardChartFontFamily}
                tickFormatter={(v) => `€${v}`}
              />
              <Tooltip
                formatter={(value) => `€${Number(value).toFixed(2)}`}
                contentStyle={dashboardChartTooltipContentStyle}
                labelStyle={dashboardChartTooltipLabelStyle}
                itemStyle={dashboardChartTooltipItemStyle}
                cursor={dashboardBarChartTooltipCursor}
              />
              <Legend wrapperStyle={dashboardChartLegendWrapperStyle} />
              <Bar dataKey="Income" fill="#22c55e" />
              <Bar dataKey="Expenses" fill="#b91c1c" />
              <Bar dataKey="Investments" fill="#60a5fa" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
