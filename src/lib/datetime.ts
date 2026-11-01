import { TZDateMini } from '@date-fns/tz'
import { format } from 'date-fns'
import { getDateDisplayPattern } from './locale-format'

let displayTimeZone = 'Europe/Rome'

/** Configurable display zone (default Europe/Rome). */
export function getDisplayTimeZone(): string {
  return displayTimeZone
}

export function setDisplayTimeZone(timeZone: string): void {
  const trimmed = timeZone.trim()
  if (!trimmed) {
    throw new Error('Time zone is required.')
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed })
  } catch {
    throw new Error(`Invalid time zone: ${trimmed}`)
  }
  displayTimeZone = trimmed
}

/** UTC ISO 8601 instant, e.g. `2025-10-31T12:34:56.789Z`. */
export type UtcIsoString = string

export function utcNowIso(): UtcIsoString {
  return new Date().toISOString()
}

export function toUtcIsoString(value: string): UtcIsoString {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime: ${value}`)
  }
  return date.toISOString()
}

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Start of calendar day in Europe/Rome, stored as UTC ISO. */
export function romeCalendarDateToUtcIso(calendarDate: string): UtcIsoString {
  const match = CALENDAR_DATE_RE.exec(calendarDate.trim())
  if (!match) {
    throw new Error('Expected calendar date YYYY-MM-DD')
  }
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  const romeMidnight = new TZDateMini(
    year,
    monthIndex,
    day,
    0,
    0,
    0,
    0,
    getDisplayTimeZone(),
  )
  return romeMidnight.toISOString()
}

/**
 * Accepts Rome calendar input (`YYYY-MM-DD`) or an existing UTC ISO string.
 * Use for `transaction_date` / `transfer_date` before persisting.
 */
export function parseCalendarDateForStorage(input: string): UtcIsoString {
  const trimmed = input.trim()
  if (CALENDAR_DATE_RE.test(trimmed)) {
    return romeCalendarDateToUtcIso(trimmed)
  }
  return toUtcIsoString(trimmed)
}

/** Legacy rows may store bare `YYYY-MM-DD`; normalize to UTC ISO on read. */
export function normalizeStoredCalendarUtc(value: string): UtcIsoString {
  if (CALENDAR_DATE_RE.test(value)) {
    return romeCalendarDateToUtcIso(value)
  }
  return toUtcIsoString(value)
}

/** Value for `<input type="date">` (calendar day in Europe/Rome). */
export function utcIsoToRomeDateInputValue(utcIso: string): string {
  const instant = normalizeStoredCalendarUtc(utcIso)
  const inRome = new TZDateMini(new Date(instant), getDisplayTimeZone())
  return format(inRome, 'yyyy-MM-dd')
}

/** Value for `<input type="month">` (calendar month in Europe/Rome). */
export function utcIsoToRomeMonthInputValue(utcIso: string): string {
  const instant = normalizeStoredCalendarUtc(utcIso)
  const inRome = new TZDateMini(new Date(instant), getDisplayTimeZone())
  return format(inRome, 'yyyy-MM')
}

/** Start of Rome calendar month (`YYYY-MM`) as UTC ISO. */
export function parseRomeYearMonthForStorage(yearMonth: string): UtcIsoString {
  return romeMonthUtcBounds(yearMonth.trim()).startUtc
}

/** Italian calendar day label (`dd/MM/yyyy`, Europe/Rome). */
export function formatItalianCalendarDateInRome(utcIso: string): string {
  const instant = normalizeStoredCalendarUtc(utcIso)
  const inRome = new TZDateMini(new Date(instant), getDisplayTimeZone())
  return format(inRome, getDateDisplayPattern())
}

const ITALIAN_DATE_INPUT_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/

/** Rome calendar `YYYY-MM-DD` → Italian form display `dd/MM/yyyy`. */
export function formatRomeCalendarDateInputItalian(calendarDate: string): string {
  const trimmed = calendarDate.trim()
  if (!CALENDAR_DATE_RE.test(trimmed)) {
    return ''
  }
  const instant = romeCalendarDateToUtcIso(trimmed)
  return formatCalendarDateInRome(instant)
}

/** Italian typed date (`dd/MM/yyyy`, `/`, `-`, or `.`) → Rome `YYYY-MM-DD`, or null if invalid. */
export function parseItalianCalendarDateInput(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  const match = ITALIAN_DATE_INPUT_RE.exec(trimmed)
  if (!match) {
    return null
  }
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    return null
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }
  if (!Number.isInteger(day) || day < 1 || day > daysInRomeMonth(year, month)) {
    return null
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function todayRomeDateInputValue(): string {
  const inRome = new TZDateMini(Date.now(), getDisplayTimeZone())
  return format(inRome, 'yyyy-MM-dd')
}

export function currentRomeYearMonth(): string {
  const inRome = new TZDateMini(Date.now(), getDisplayTimeZone())
  return format(inRome, 'yyyy-MM')
}

export function currentRomeYear(): number {
  const inRome = new TZDateMini(Date.now(), getDisplayTimeZone())
  return inRome.getFullYear()
}

const YEAR_MONTH_RE = /^(\d{4})-(\d{2})$/

export function romeMonthUtcBounds(yearMonth: string): {
  startUtc: UtcIsoString
  endUtcExclusive: UtcIsoString
} {
  const match = YEAR_MONTH_RE.exec(yearMonth)
  if (!match) {
    throw new Error('Expected year-month YYYY-MM')
  }
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const startUtc = new TZDateMini(
    year,
    monthIndex,
    1,
    0,
    0,
    0,
    0,
    getDisplayTimeZone(),
  ).toISOString()
  const endUtcExclusive = new TZDateMini(
    monthIndex === 11 ? year + 1 : year,
    monthIndex === 11 ? 0 : monthIndex + 1,
    1,
    0,
    0,
    0,
    0,
    getDisplayTimeZone(),
  ).toISOString()
  return { startUtc, endUtcExclusive }
}

export function romeDayUtcBounds(calendarDate: string): {
  startUtc: UtcIsoString
  endUtcExclusive: UtcIsoString
} {
  const startUtc = romeCalendarDateToUtcIso(calendarDate)
  const [y, m, d] = calendarDate.split('-').map(Number)
  const next = new TZDateMini(y!, m! - 1, d! + 1, 0, 0, 0, 0, getDisplayTimeZone())
  return { startUtc, endUtcExclusive: next.toISOString() }
}

export function romeYearUtcBounds(year: number): {
  startUtc: UtcIsoString
  endUtcExclusive: UtcIsoString
} {
  return {
    startUtc: new TZDateMini(
      year,
      0,
      1,
      0,
      0,
      0,
      0,
      getDisplayTimeZone(),
    ).toISOString(),
    endUtcExclusive: new TZDateMini(
      year + 1,
      0,
      1,
      0,
      0,
      0,
      0,
      getDisplayTimeZone(),
    ).toISOString(),
  }
}

export function daysInRomeMonth(year: number, month: number): number {
  const inRome = new TZDateMini(year, month - 1, 1, getDisplayTimeZone())
  void inRome
  return new TZDateMini(year, month, 0, getDisplayTimeZone()).getDate()
}

export function formatRomeMonthLabel(yearMonth: string): string {
  const { startUtc } = romeMonthUtcBounds(yearMonth)
  const inRome = new TZDateMini(new Date(startUtc), getDisplayTimeZone())
  return format(inRome, 'MMM yyyy')
}

export function formatRomeDayShortLabel(calendarDate: string): string {
  const inRome = new TZDateMini(
    Number(calendarDate.slice(0, 4)),
    Number(calendarDate.slice(5, 7)) - 1,
    Number(calendarDate.slice(8, 10)),
    getDisplayTimeZone(),
  )
  return format(inRome, 'd MMM')
}

export function addMonthsToYearMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const d = new TZDateMini(y!, m! - 1 + delta, 1, getDisplayTimeZone())
  return format(d, 'yyyy-MM')
}

/** Add calendar days in Europe/Rome (`YYYY-MM-DD`). */
export function addDaysToRomeCalendarDate(calendarDate: string, days: number): string {
  const [y, m, d] = calendarDate.split('-').map(Number)
  const next = new TZDateMini(y!, m! - 1, d! + days, 0, 0, 0, 0, getDisplayTimeZone())
  return format(next, 'yyyy-MM-dd')
}

/** English UI label for a stored calendar instant. */
export function formatCalendarDateInRome(utcIso: string): string {
  const instant = normalizeStoredCalendarUtc(utcIso)
  const inRome = new TZDateMini(new Date(instant), getDisplayTimeZone())
  return format(inRome, getDateDisplayPattern())
}

/** English UI label for an audit timestamp (`created_at`, `archived_at`, …). */
export function formatDateTimeInRome(utcIso: string): string {
  const instant = toUtcIsoString(utcIso)
  const inRome = new TZDateMini(new Date(instant), getDisplayTimeZone())
  return format(inRome, 'd MMM yyyy, HH:mm')
}
