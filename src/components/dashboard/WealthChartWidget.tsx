import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { WealthSeriesPoint } from '../../db/repositories/dashboard'
import {
  dashboardChartFontFamily,
  dashboardChartLegendWrapperStyle,
  dashboardChartTooltipContentStyle,
  dashboardChartTooltipItemStyle,
  dashboardChartTooltipLabelStyle,
} from './dashboardChartUi'

type WealthChartWidgetProps = {
  title: string
  data: WealthSeriesPoint[]
  emptyMessage?: string
  className?: string
}

export function WealthChartWidget({
  title,
  data,
  emptyMessage = 'No wealth history yet.',
  className,
}: WealthChartWidgetProps) {
  const chartData = data.map((row) => ({
    name: row.label,
    Total: row.totalCents / 100,
    Cash: row.cashCents / 100,
    Investment: row.investmentCents / 100,
  }))
  const hasData = chartData.length > 0

  const sectionClass = [
    'flex flex-col rounded-xl border border-slate-800 bg-slate-900/30 p-4',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={sectionClass}>
      <h3 className="mb-4 shrink-0 text-sm font-semibold text-slate-200">{title}</h3>
      {!hasData ? (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="min-h-0 w-full flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
            >
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
                cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Legend wrapperStyle={dashboardChartLegendWrapperStyle} />
              <Line
                type="monotone"
                dataKey="Total"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Cash"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Investment"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
