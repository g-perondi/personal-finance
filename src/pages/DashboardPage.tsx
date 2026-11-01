import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  LineChart,
  PiggyBank,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useMemo } from 'react'
import { CashflowChartWidget } from '../components/dashboard/CashflowChartWidget'
import { DashboardPeriodToolbar } from '../components/dashboard/DashboardPeriodToolbar'
import { DashboardScopeBar } from '../components/dashboard/DashboardScopeBar'
import { LedgerTableWidget } from '../components/dashboard/LedgerTableWidget'
import { KpiWidget } from '../components/dashboard/KpiWidget'
import { WealthChartWidget } from '../components/dashboard/WealthChartWidget'
import {
  countLedgerInPeriod,
  getCashflowTrendByYear,
  getCashflowTrendForYear,
  getPeriodTotals,
  getTotalWealthCentsAt,
  getWealthDailySeries,
  getWealthMonthlySeriesLastMonths,
  getWealthMonthlySeriesForYear,
  listLedgerInPeriod,
} from '../db/repositories/dashboard'
import {
  periodBounds,
  yearFromPeriod,
  yearMonthFromPeriod,
} from '../lib/dashboard-period'
import {
  formatSavingsRate,
  priorPeriod,
  savedCents,
  savingsRate,
  savingsRateDeltaPp,
} from '../lib/savings'
import { amountColorClass, signedAmountColorClass } from '../lib/amount-colors'
import { formatCents } from '../lib/money'
import { APP_SCROLLBAR_CLASS } from '../lib/scroll-ui'
import { useDashboardPeriod } from '../hooks/useDashboardPeriod'
import { useDatabase } from '../hooks/useDatabase'
import { usePortfolioQuotes } from '../hooks/usePortfolioQuotes'
import { useAppSettings } from '../context/AppSettingsProvider'

export function DashboardPage() {
  const db = useDatabase()
  const { settings } = useAppSettings()
  const investmentsEnabled = settings.investmentsEnabled
  const portfolio = usePortfolioQuotes()
  const { scope, period, earliestYear, setScope, setPeriod } = useDashboardPeriod()
  const bounds = useMemo(
    () => periodBounds(period, earliestYear),
    [period, earliestYear],
  )
  const prior = useMemo(() => priorPeriod(period), [period])
  const priorBounds = useMemo(
    () => (prior ? periodBounds(prior, earliestYear) : null),
    [prior, earliestYear],
  )
  const data = useMemo(() => {
    const totals = getPeriodTotals(db, bounds.startUtc, bounds.endUtcExclusive)
    const priorTotals = priorBounds
      ? getPeriodTotals(db, priorBounds.startUtc, priorBounds.endUtcExclusive)
      : null
    const balanceAtPeriodEnd = getTotalWealthCentsAt(db, bounds.endUtcExclusive)
    const rate = savingsRate(totals)
    const priorRate = priorTotals ? savingsRate(priorTotals) : null
    const deltaPp = savingsRateDeltaPp(rate, priorRate)

    const year = yearFromPeriod(period)
    const yearMonth = yearMonthFromPeriod(period)

    const cashflowYear = getCashflowTrendForYear(db, year).map((row) => ({
      label: row.label,
      income: row.incomeCents,
      expense: row.expenseCents,
      investment: row.investmentCents,
    }))

    const cashflowByYear = getCashflowTrendByYear(db, earliestYear).map((row) => ({
      label: row.label,
      income: row.incomeCents,
      expense: row.expenseCents,
      investment: row.investmentCents,
    }))

    const cashflowSingle = [
      {
        label: scope === 'day' ? bounds.fromYmd : yearMonth,
        income: totals.incomeCents,
        expense: totals.expenseCents,
        investment: totals.investmentCents,
      },
    ]

    return {
      totals,
      balanceAtPeriodEnd,
      rate,
      deltaPp,
      cashflowYear,
      cashflowByYear,
      cashflowSingle,
      wealthLast12Months: getWealthMonthlySeriesLastMonths(db, earliestYear, 12),
      wealthMonthly: getWealthMonthlySeriesForYear(db, year),
      wealthDaily: getWealthDailySeries(db, yearMonth),
      recentMovements: listLedgerInPeriod(db, bounds.startUtc, bounds.endUtcExclusive, {
        limit: 20,
      }),
      movementCount: countLedgerInPeriod(db, bounds.startUtc, bounds.endUtcExclusive),
    }
  }, [db, bounds, priorBounds, period, scope, earliestYear])

  const wealthPanel = useMemo(() => {
    const wealthData =
      scope === 'global'
        ? data.wealthLast12Months
        : scope === 'year'
          ? data.wealthMonthly
          : data.wealthDaily
    return (
      <WealthChartWidget
        key="wealth"
        title="Wealth"
        data={wealthData}
        showInvestments={investmentsEnabled}
        className="dashboard-row1-panel-h min-w-0 lg:col-start-1 lg:row-start-1"
      />
    )
  }, [scope, data, investmentsEnabled])

  const belowRowPanels = useMemo(() => {
    if (scope === 'global') {
      return [
        <CashflowChartWidget
          key="cashflow"
          title="Cashflow"
          data={data.cashflowByYear}
          showInvestments={investmentsEnabled}
        />,
      ]
    }
    if (scope === 'year') {
      return [
        <CashflowChartWidget
          key="cashflow"
          title="Cashflow"
          data={data.cashflowYear}
          showInvestments={investmentsEnabled}
        />,
      ]
    }
    return [
      <CashflowChartWidget
        key="cashflow"
        title="Cashflow"
        data={data.cashflowSingle}
        showInvestments={investmentsEnabled}
      />,
    ]
  }, [scope, data, investmentsEnabled])

  const deltaLabel =
    data.deltaPp === null
      ? undefined
      : `${data.deltaPp >= 0 ? '+' : ''}${Math.round(data.deltaPp * 10) / 10} pp vs prior`

  const netBalanceCents = savedCents(data.totals)

  const kpiItems = [
    {
      label: 'Total balance',
      icon: Landmark,
      value: formatCents(data.balanceAtPeriodEnd),
      valueClassName: amountColorClass.wealth,
      iconClassName: amountColorClass.wealth,
    },
    ...(investmentsEnabled && portfolio.holdings.length > 0
      ? [
          {
            label: 'Portfolio value',
            icon: LineChart,
            value:
              portfolio.totals.marketValueCents === null
                ? '—'
                : formatCents(portfolio.totals.marketValueCents),
            valueClassName: amountColorClass.transfer,
            iconClassName: amountColorClass.transfer,
          },
        ]
      : []),
    {
      label: 'Income',
      icon: ArrowDownLeft,
      value: formatCents(data.totals.incomeCents),
      valueClassName: amountColorClass.inflow,
      iconClassName: amountColorClass.inflow,
    },
    {
      label: 'Expenses',
      icon: ArrowUpRight,
      value: formatCents(data.totals.expenseCents),
      valueClassName: amountColorClass.outflow,
      iconClassName: amountColorClass.outflow,
    },
    ...(investmentsEnabled
      ? [
          {
            label: 'Investments',
            icon: TrendingUp,
            value: formatCents(data.totals.investmentCents),
            valueClassName: amountColorClass.investment,
            iconClassName: amountColorClass.investment,
          },
        ]
      : []),
    {
      label: 'Net balance',
      icon: Wallet,
      value: formatCents(netBalanceCents),
      valueClassName: signedAmountColorClass(netBalanceCents),
      iconClassName: signedAmountColorClass(netBalanceCents),
    },
    {
      label: 'Savings rate',
      icon: PiggyBank,
      value: formatSavingsRate(data.rate),
      valueClassName: amountColorClass.savings,
      iconClassName: amountColorClass.savings,
      hint: deltaLabel,
    },
  ]

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-8 ${APP_SCROLLBAR_CLASS}`}
    >
      <header className="border-b border-slate-800 pb-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-3">
          <div className="md:justify-self-start">
            <h2 className="text-2xl font-semibold text-white">Dashboard</h2>
          </div>

          <div className="flex justify-center md:justify-self-center">
            <DashboardPeriodToolbar
              scope={scope}
              period={period}
              earliestYear={earliestYear}
              onPeriodChange={setPeriod}
            />
          </div>

          <div className="flex justify-center md:justify-self-end">
            <DashboardScopeBar scope={scope} onScopeChange={setScope} />
          </div>
        </div>
      </header>

      <KpiWidget items={kpiItems} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {wealthPanel}

        <LedgerTableWidget
          className="h-full min-h-0 min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1"
          title="Last movements"
          rows={data.recentMovements}
          totalCount={data.movementCount}
          viewAllHref="/transactions"
        />

        {belowRowPanels.map((panel) => (
          <div key={panel.key} className="min-w-0 lg:col-start-1 lg:row-start-2">
            {panel}
          </div>
        ))}
      </div>
    </div>
  )
}
