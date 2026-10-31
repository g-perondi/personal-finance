import { TZDateMini } from '@date-fns/tz'
import { format } from 'date-fns'
import type { DashboardPeriod } from './dashboard-period'
import { addMonthsToYearMonth, DISPLAY_TIME_ZONE } from './datetime'

export type MonthTotals = {
  incomeCents: number
  expenseCents: number
  investmentCents: number
}

export function savedCents(totals: MonthTotals): number {
  return totals.incomeCents - totals.expenseCents
}

export function savingsRate(totals: MonthTotals): number | null {
  if (totals.incomeCents <= 0) {
    return null
  }
  return savedCents(totals) / totals.incomeCents
}

export function formatSavingsRate(rate: number | null): string {
  if (rate === null) {
    return '—'
  }
  return `${Math.round(rate * 1000) / 10}%`
}

export function savingsRateDeltaPp(
  current: number | null,
  prior: number | null,
): number | null {
  if (current === null || prior === null) {
    return null
  }
  return current * 100 - prior * 100
}

export function priorPeriod(period: DashboardPeriod): DashboardPeriod | null {
  if (period.scope === 'global') {
    return null
  }
  if (period.scope === 'year') {
    return { scope: 'year', year: period.year - 1 }
  }
  if (period.scope === 'month') {
    return { scope: 'month', yearMonth: addMonthsToYearMonth(period.yearMonth, -1) }
  }
  const [y, m, d] = period.calendarDate.split('-').map(Number)
  const prev = new TZDateMini(y!, m! - 1, d! - 1, DISPLAY_TIME_ZONE)
  return { scope: 'day', calendarDate: format(prev, 'yyyy-MM-dd') }
}
