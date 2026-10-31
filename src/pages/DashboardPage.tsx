import { useMemo, useState } from 'react'
import { CashflowChartWidget } from '../components/dashboard/CashflowChartWidget'
import { DashboardPeriodToolbar } from '../components/dashboard/DashboardPeriodToolbar'
import { DashboardScopeBar } from '../components/dashboard/DashboardScopeBar'
import { LedgerTableWidget } from '../components/dashboard/LedgerTableWidget'
import { KpiWidget } from '../components/dashboard/KpiWidget'
import { WealthChartWidget } from '../components/dashboard/WealthChartWidget'
import { getEarliestAccountYearInRome } from '../db/repositories/account'
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
  clampPeriodForDashboard,
  coercePeriodForScope,
  defaultDashboardPeriod,
  periodBounds,
  yearFromPeriod,
  yearMonthFromPeriod,
  type DashboardPeriod,
  type DashboardScope,
} from '../lib/dashboard-period'
import {
  formatSavingsRate,
  priorPeriod,
  savedCents,
  savingsRate,
  savingsRateDeltaPp,
} from '../lib/savings'
import { formatCents } from '../lib/money'
import { amountColorClass, signedAmountColorClass } from '../lib/amount-colors'
import { useDatabase } from '../hooks/useDatabase'
import { usePortfolioQuotes } from '../hooks/usePortfolioQuotes'

/** Cashflow (and any extra charts) wrap from row 2; row 1 is Wealth + Last movements. */
function dashboardBelowRowGridClass(index: number): string {
  const row = 2 + Math.floor(index / 2)
  const col = (index % 2) + 1
  const colClass = col === 1 ? 'lg:col-start-1' : 'lg:col-start-2'
  return `min-w-0 ${colClass} lg:row-start-[${row}]`
}

export function DashboardPage() {
  const db = useDatabase()
  const portfolio = usePortfolioQuotes()
  const [scope, setScope] = useState<DashboardScope>('global')
  const [period, setPeriod] = useState<DashboardPeriod>(() => defaultDashboardPeriod())

  const earliestYear = useMemo(() => getEarliestAccountYearInRome(db), [db])
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
        className="dashboard-row1-panel-h min-w-0 lg:col-start-1 lg:row-start-1"
      />
    )
  }, [scope, data])

  const belowRowPanels = useMemo(() => {
    if (scope === 'global') {
      return [
        <CashflowChartWidget
          key="cashflow"
          title="Cashflow"
          data={data.cashflowByYear}
        />,
      ]
    }
    if (scope === 'year') {
      return [
        <CashflowChartWidget
          key="cashflow"
          title="Cashflow"
          data={data.cashflowYear}
        />,
      ]
    }
    return [
      <CashflowChartWidget
        key="cashflow"
        title="Cashflow"
        data={data.cashflowSingle}
      />,
    ]
  }, [scope, data])

  function handleScopeChange(next: DashboardScope) {
    setScope(next)
    setPeriod((current) => coercePeriodForScope(next, current, earliestYear))
  }

  function handlePeriodChange(next: DashboardPeriod) {
    setPeriod(clampPeriodForDashboard(next, earliestYear))
  }

  const deltaLabel =
    data.deltaPp === null
      ? undefined
      : `${data.deltaPp >= 0 ? '+' : ''}${Math.round(data.deltaPp * 10) / 10} pp vs prior`

  const netBalanceCents = savedCents(data.totals)

  const kpiItems = [
    {
      label: 'Total balance',
      value: formatCents(data.balanceAtPeriodEnd),
      valueClassName: 'text-yellow-400',
    },
    ...(portfolio.holdings.length > 0
      ? [
          {
            label: 'Portfolio value',
            value:
              portfolio.totals.marketValueCents === null
                ? '—'
                : formatCents(portfolio.totals.marketValueCents),
            valueClassName: amountColorClass.transfer,
          },
        ]
      : []),
    {
      label: 'Income',
      value: formatCents(data.totals.incomeCents),
      valueClassName: amountColorClass.inflow,
    },
    {
      label: 'Expenses',
      value: formatCents(data.totals.expenseCents),
      valueClassName: amountColorClass.outflow,
    },
    {
      label: 'Investments',
      value: formatCents(data.totals.investmentCents),
      valueClassName: amountColorClass.outflow,
    },
    {
      label: 'Net balance',
      value: formatCents(netBalanceCents),
      valueClassName: signedAmountColorClass(netBalanceCents),
    },
    {
      label: 'Savings rate',
      value: formatSavingsRate(data.rate),
      hint: deltaLabel,
    },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-8">
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
              onPeriodChange={handlePeriodChange}
            />
          </div>

          <div className="flex justify-center md:justify-self-end">
            <DashboardScopeBar scope={scope} onScopeChange={handleScopeChange} />
          </div>
        </div>
      </header>

      <KpiWidget items={kpiItems} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        {wealthPanel}

        <LedgerTableWidget
          className="dashboard-row1-panel-h min-w-0 lg:col-start-2 lg:row-start-1"
          title="Last movements"
          rows={data.recentMovements}
          totalCount={data.movementCount}
          viewAllHref="/transactions"
        />

        {belowRowPanels.map((panel, index) => (
          <div key={panel.key} className={dashboardBelowRowGridClass(index)}>
            {panel}
          </div>
        ))}
      </div>
    </div>
  )
}
