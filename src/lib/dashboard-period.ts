import { TZDateMini } from '@date-fns/tz'
import { format } from 'date-fns'
import {
  addMonthsToYearMonth,
  currentRomeYear,
  currentRomeYearMonth,
  daysInRomeMonth,
  getDisplayTimeZone,
  formatRomeMonthLabel,
  romeDayUtcBounds,
  romeMonthUtcBounds,
  romeYearUtcBounds,
  todayRomeDateInputValue,
  type UtcIsoString,
} from './datetime'

export type DashboardScope = 'global' | 'year' | 'month' | 'day'

export type DashboardPeriod =
  | { scope: 'global' }
  | { scope: 'year'; year: number }
  | { scope: 'month'; yearMonth: string }
  | { scope: 'day'; calendarDate: string }

export type PeriodBounds = {
  startUtc: UtcIsoString
  endUtcExclusive: UtcIsoString
  fromYmd: string
  toYmdInclusive: string
}

export function defaultDashboardPeriod(): DashboardPeriod {
  return { scope: 'global' }
}

/** Period anchored to today in Europe/Rome for the given scope. */
export function currentPeriodForScope(scope: DashboardScope): DashboardPeriod {
  if (scope === 'global') {
    return { scope: 'global' }
  }
  if (scope === 'year') {
    return { scope: 'year', year: currentRomeYear() }
  }
  if (scope === 'month') {
    return { scope: 'month', yearMonth: currentRomeYearMonth() }
  }
  return { scope: 'day', calendarDate: todayRomeDateInputValue() }
}

export function globalPeriodBounds(earliestYear: number): PeriodBounds {
  const minYear = Math.min(earliestYear, currentRomeYear())
  const { startUtc } = romeYearUtcBounds(minYear)
  const today = todayRomeDateInputValue()
  const { endUtcExclusive } = romeDayUtcBounds(today)
  return {
    startUtc,
    endUtcExclusive,
    fromYmd: `${minYear}-01-01`,
    toYmdInclusive: today,
  }
}

export function periodBounds(
  period: DashboardPeriod,
  earliestYear: number,
): PeriodBounds {
  if (period.scope === 'global') {
    return globalPeriodBounds(earliestYear)
  }
  if (period.scope === 'year') {
    const { startUtc, endUtcExclusive } = romeYearUtcBounds(period.year)
    return {
      startUtc,
      endUtcExclusive,
      fromYmd: `${period.year}-01-01`,
      toYmdInclusive: `${period.year}-12-31`,
    }
  }
  if (period.scope === 'month') {
    const { startUtc, endUtcExclusive } = romeMonthUtcBounds(period.yearMonth)
    const [y, m] = period.yearMonth.split('-').map(Number)
    const lastDay = daysInRomeMonth(y!, m!)
    return {
      startUtc,
      endUtcExclusive,
      fromYmd: `${period.yearMonth}-01`,
      toYmdInclusive: `${period.yearMonth}-${String(lastDay).padStart(2, '0')}`,
    }
  }
  const { startUtc, endUtcExclusive } = romeDayUtcBounds(period.calendarDate)
  return {
    startUtc,
    endUtcExclusive,
    fromYmd: period.calendarDate,
    toYmdInclusive: period.calendarDate,
  }
}

export function yearFromPeriod(period: DashboardPeriod): number {
  if (period.scope === 'global') {
    return currentRomeYear()
  }
  if (period.scope === 'year') {
    return period.year
  }
  if (period.scope === 'month') {
    return Number(period.yearMonth.slice(0, 4))
  }
  return Number(period.calendarDate.slice(0, 4))
}

export function yearMonthFromPeriod(period: DashboardPeriod): string {
  if (period.scope === 'month') {
    return period.yearMonth
  }
  if (period.scope === 'day') {
    return period.calendarDate.slice(0, 7)
  }
  return `${yearFromPeriod(period)}-01`
}

function minYearMonth(earliestYear: number): string {
  const minYear = Math.min(earliestYear, currentRomeYear())
  return `${minYear}-01`
}

function minCalendarDate(earliestYear: number): string {
  return `${minYearMonth(earliestYear).slice(0, 4)}-01-01`
}

export function periodForScope(
  scope: DashboardScope,
  source: DashboardPeriod,
): DashboardPeriod {
  if (scope === 'global') {
    return { scope: 'global' }
  }
  if (scope === 'year') {
    return { scope: 'year', year: yearFromPeriod(source) }
  }
  if (scope === 'month') {
    return { scope: 'month', yearMonth: yearMonthFromPeriod(source) }
  }
  if (source.scope === 'day') {
    return source
  }
  const ym = yearMonthFromPeriod(source)
  const day = ym === currentRomeYearMonth() ? todayRomeDateInputValue() : `${ym}-01`
  return { scope: 'day', calendarDate: day }
}

/** Clamp to earliest account year and to today in Europe/Rome (no future periods). */
export function clampPeriodForDashboard(
  period: DashboardPeriod,
  earliestYear: number,
): DashboardPeriod {
  const maxYear = currentRomeYear()
  const minYear = Math.min(earliestYear, maxYear)
  const maxYm = currentRomeYearMonth()
  const maxDay = todayRomeDateInputValue()
  const minYm = minYearMonth(earliestYear)
  const minDay = minCalendarDate(earliestYear)

  if (period.scope === 'global') {
    return { scope: 'global' }
  }

  if (period.scope === 'year') {
    const year = Math.min(Math.max(period.year, minYear), maxYear)
    return { scope: 'year', year }
  }
  if (period.scope === 'month') {
    let ym = period.yearMonth
    if (ym < minYm) {
      ym = minYm
    }
    if (ym > maxYm) {
      ym = maxYm
    }
    return { scope: 'month', yearMonth: ym }
  }
  let date = period.calendarDate
  if (date < minDay) {
    date = minDay
  }
  if (date > maxDay) {
    date = maxDay
  }
  return { scope: 'day', calendarDate: date }
}

function shiftDashboardPeriodRaw(
  period: DashboardPeriod,
  delta: -1 | 1,
): DashboardPeriod {
  if (period.scope === 'global') {
    return period
  }
  if (period.scope === 'year') {
    return { scope: 'year', year: period.year + delta }
  }
  if (period.scope === 'month') {
    return {
      scope: 'month',
      yearMonth: addMonthsToYearMonth(period.yearMonth, delta),
    }
  }
  const [y, m, d] = period.calendarDate.split('-').map(Number)
  const next = new TZDateMini(y!, m! - 1, d! + delta, getDisplayTimeZone())
  return { scope: 'day', calendarDate: format(next, 'yyyy-MM-dd') }
}

function periodsEqual(a: DashboardPeriod, b: DashboardPeriod): boolean {
  if (a.scope !== b.scope) {
    return false
  }
  switch (a.scope) {
    case 'global':
      return b.scope === 'global'
    case 'year':
      return b.scope === 'year' && a.year === b.year
    case 'month':
      return b.scope === 'month' && a.yearMonth === b.yearMonth
    case 'day':
      return b.scope === 'day' && a.calendarDate === b.calendarDate
  }
}

export function shiftDashboardPeriod(
  period: DashboardPeriod,
  scope: DashboardScope,
  delta: -1 | 1,
  earliestYear: number,
): DashboardPeriod {
  if (scope === 'global') {
    return { scope: 'global' }
  }
  const aligned = clampPeriodForDashboard(periodForScope(scope, period), earliestYear)
  const raw = shiftDashboardPeriodRaw(aligned, delta)
  return clampPeriodForDashboard(raw, earliestYear)
}

export function canShiftDashboardPeriod(
  period: DashboardPeriod,
  scope: DashboardScope,
  delta: -1 | 1,
  earliestYear: number,
): boolean {
  if (scope === 'global') {
    return false
  }
  const aligned = clampPeriodForDashboard(periodForScope(scope, period), earliestYear)
  const next = shiftDashboardPeriod(period, scope, delta, earliestYear)
  return !periodsEqual(aligned, next)
}

export function formatDashboardPeriodLabel(
  period: DashboardPeriod,
  scope: DashboardScope,
  earliestYear: number,
): string {
  if (scope === 'global') {
    const minYear = Math.min(earliestYear, currentRomeYear())
    const maxYear = currentRomeYear()
    return minYear === maxYear ? String(maxYear) : `${minYear}–${maxYear}`
  }
  const aligned = periodForScope(scope, period)
  if (aligned.scope === 'year') {
    return String(aligned.year)
  }
  if (aligned.scope === 'month') {
    return formatRomeMonthLabel(aligned.yearMonth)
  }
  if (aligned.scope === 'day') {
    const [y, m, d] = aligned.calendarDate.split('-').map(Number)
    const inRome = new TZDateMini(y!, m! - 1, d!, getDisplayTimeZone())
    return format(inRome, 'EEE, d MMM yyyy')
  }
  return String(currentRomeYear())
}

export function getDashboardPeriodPickerBounds(earliestYear: number): {
  minYear: number
  maxYear: number
  minYearMonth: string
  maxYearMonth: string
  minCalendarDate: string
  maxCalendarDate: string
} {
  const maxYear = currentRomeYear()
  const minYear = Math.min(earliestYear, maxYear)
  return {
    minYear,
    maxYear,
    minYearMonth: minYearMonth(earliestYear),
    maxYearMonth: currentRomeYearMonth(),
    minCalendarDate: minCalendarDate(earliestYear),
    maxCalendarDate: todayRomeDateInputValue(),
  }
}

export function coercePeriodForScope(
  scope: DashboardScope,
  _current: DashboardPeriod,
  earliestYear: number,
): DashboardPeriod {
  return clampPeriodForDashboard(currentPeriodForScope(scope), earliestYear)
}

export { currentRomeYear, currentRomeYearMonth, todayRomeDateInputValue }
