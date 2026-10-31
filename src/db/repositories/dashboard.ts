import type { Database } from 'sql.js'
import type { TransactionKind } from '../types'
import {
  currentRomeYear,
  daysInRomeMonth,
  formatRomeMonthLabel,
  romeDayUtcBounds,
  romeMonthUtcBounds,
  romeYearUtcBounds,
  todayRomeDateInputValue,
  addMonthsToYearMonth,
  currentRomeYearMonth,
} from '../../lib/datetime'
import type { MonthTotals } from '../../lib/savings'
import { TRANSACTION_TABLE } from './sql'

const SIGNED_DELTA_SQL = `
  CASE
    WHEN t.kind = 'income' THEN t.amount_cents
    WHEN t.kind IN ('expense', 'investment') THEN -t.amount_cents
    WHEN t.kind = 'transfer' AND t.transfer_leg = 'in' THEN t.amount_cents
    WHEN t.kind = 'transfer' AND t.transfer_leg = 'out' THEN -t.amount_cents
    ELSE 0
  END
`

export function getPeriodTotals(
  db: Database,
  startUtc: string,
  endUtcExclusive: string,
): MonthTotals {
  const stmt = db.prepare(`
    SELECT kind, COALESCE(SUM(amount_cents), 0) AS total
    FROM ${TRANSACTION_TABLE}
    WHERE transaction_date >= ? AND transaction_date < ?
      AND kind IN ('income', 'expense', 'investment')
    GROUP BY kind
  `)
  stmt.bind([startUtc, endUtcExclusive])
  const totals: MonthTotals = { incomeCents: 0, expenseCents: 0, investmentCents: 0 }
  while (stmt.step()) {
    const row = stmt.getAsObject()
    const kind = String(row.kind)
    const total = Number(row.total)
    if (kind === 'income') {
      totals.incomeCents = total
    } else if (kind === 'expense') {
      totals.expenseCents = total
    } else if (kind === 'investment') {
      totals.investmentCents = total
    }
  }
  stmt.free()
  return totals
}

export type CashflowTrendPoint = {
  key: string
  label: string
  incomeCents: number
  expenseCents: number
  investmentCents: number
}

export function getCashflowTrendForYear(
  db: Database,
  year: number,
): CashflowTrendPoint[] {
  const points: CashflowTrendPoint[] = []
  for (let m = 1; m <= 12; m += 1) {
    const ym = `${year}-${String(m).padStart(2, '0')}`
    const { startUtc, endUtcExclusive } = romeMonthUtcBounds(ym)
    const t = getPeriodTotals(db, startUtc, endUtcExclusive)
    points.push({
      key: ym,
      label: formatRomeMonthLabel(ym).slice(0, 3),
      ...t,
    })
  }
  return points
}

function yearTotalsBounds(year: number): {
  startUtc: string
  endUtcExclusive: string
} {
  const { startUtc, endUtcExclusive: yearEnd } = romeYearUtcBounds(year)
  if (year < currentRomeYear()) {
    return { startUtc, endUtcExclusive: yearEnd }
  }
  const { endUtcExclusive } = romeDayUtcBounds(todayRomeDateInputValue())
  return { startUtc, endUtcExclusive }
}

export function getCashflowTrendByYear(
  db: Database,
  earliestYear: number,
): CashflowTrendPoint[] {
  const endYear = currentRomeYear()
  const minYear = Math.min(earliestYear, endYear)
  const points: CashflowTrendPoint[] = []
  for (let y = minYear; y <= endYear; y += 1) {
    const { startUtc, endUtcExclusive } = yearTotalsBounds(y)
    const t = getPeriodTotals(db, startUtc, endUtcExclusive)
    points.push({
      key: String(y),
      label: String(y),
      ...t,
    })
  }
  return points
}

export function getTotalWealthCentsAt(db: Database, asOfUtcExclusive: string): number {
  const stmt = db.prepare(`
    SELECT COALESCE(SUM(
      CASE
        WHEN account.opened_at >= ? THEN 0
        ELSE account.opening_balance_cents + COALESCE((
          SELECT SUM(${SIGNED_DELTA_SQL})
          FROM ${TRANSACTION_TABLE} t
          WHERE t.account_id = account.id AND t.transaction_date < ?
        ), 0)
      END
    ), 0) AS wealth_cents
    FROM account
    WHERE account.archived_at IS NULL
  `)
  stmt.bind([asOfUtcExclusive, asOfUtcExclusive])
  stmt.step()
  const wealth = Number(stmt.getAsObject().wealth_cents)
  stmt.free()
  return wealth
}

/** Sum of `investment` amounts on non-archived accounts before `asOfUtcExclusive`. */
export function getCumulativeInvestmentCentsAt(
  db: Database,
  asOfUtcExclusive: string,
): number {
  const stmt = db.prepare(`
    SELECT COALESCE(SUM(t.amount_cents), 0) AS invested_cents
    FROM ${TRANSACTION_TABLE} t
    INNER JOIN account a ON a.id = t.account_id
    WHERE a.archived_at IS NULL
      AND a.opened_at < ?
      AND t.kind = 'investment'
      AND t.transaction_date < ?
  `)
  stmt.bind([asOfUtcExclusive, asOfUtcExclusive])
  stmt.step()
  const invested = Number(stmt.getAsObject().invested_cents)
  stmt.free()
  return invested
}

export type WealthSeriesPoint = {
  key: string
  label: string
  totalCents: number
  cashCents: number
  investmentCents: number
}

function wealthSeriesPointAt(
  db: Database,
  key: string,
  label: string,
  asOfUtcExclusive: string,
): WealthSeriesPoint {
  const totalCents = getTotalWealthCentsAt(db, asOfUtcExclusive)
  const investmentCents = getCumulativeInvestmentCentsAt(db, asOfUtcExclusive)
  return {
    key,
    label,
    totalCents,
    cashCents: totalCents - investmentCents,
    investmentCents,
  }
}

export function getWealthDailySeries(
  db: Database,
  yearMonth: string,
): WealthSeriesPoint[] {
  const [y, m] = yearMonth.split('-').map(Number)
  const lastDay = daysInRomeMonth(y!, m!)
  const points: WealthSeriesPoint[] = []
  for (let d = 1; d <= lastDay; d += 1) {
    const date = `${yearMonth}-${String(d).padStart(2, '0')}`
    const { endUtcExclusive } = romeDayUtcBounds(date)
    points.push(wealthSeriesPointAt(db, date, String(d), endUtcExclusive))
  }
  return points
}

export function getWealthMonthlySeriesForYear(
  db: Database,
  year: number,
): WealthSeriesPoint[] {
  const points: WealthSeriesPoint[] = []
  for (let m = 1; m <= 12; m += 1) {
    const ym = `${year}-${String(m).padStart(2, '0')}`
    const { endUtcExclusive } = romeMonthUtcBounds(ym)
    points.push(
      wealthSeriesPointAt(
        db,
        ym,
        formatRomeMonthLabel(ym).slice(0, 3),
        endUtcExclusive,
      ),
    )
  }
  return points
}

function wealthAsOfMonthEndUtcExclusive(yearMonth: string): string {
  const maxYm = currentRomeYearMonth()
  if (yearMonth < maxYm) {
    return romeMonthUtcBounds(yearMonth).endUtcExclusive
  }
  return romeDayUtcBounds(todayRomeDateInputValue()).endUtcExclusive
}

/** Last N calendar months in Europe/Rome (oldest first), capped at earliest account year. */
export function getWealthMonthlySeriesLastMonths(
  db: Database,
  earliestYear: number,
  monthCount = 12,
): WealthSeriesPoint[] {
  const minYm = `${Math.min(earliestYear, currentRomeYear())}-01`
  let ym = currentRomeYearMonth()
  const yearMonths: string[] = []
  for (let i = 0; i < monthCount; i += 1) {
    if (ym < minYm) {
      break
    }
    yearMonths.push(ym)
    ym = addMonthsToYearMonth(ym, -1)
  }
  yearMonths.reverse()
  return yearMonths.map((month) =>
    wealthSeriesPointAt(
      db,
      month,
      formatRomeMonthLabel(month),
      wealthAsOfMonthEndUtcExclusive(month),
    ),
  )
}

function wealthAsOfYearEndUtcExclusive(year: number): string {
  if (year < currentRomeYear()) {
    return romeYearUtcBounds(year).endUtcExclusive
  }
  return romeDayUtcBounds(todayRomeDateInputValue()).endUtcExclusive
}

export function getWealthYearlySeries(
  db: Database,
  earliestYear: number,
  yearCount?: number,
): WealthSeriesPoint[] {
  const endYear = currentRomeYear()
  const minYear = Math.min(earliestYear, endYear)
  const startYear =
    yearCount === undefined ? minYear : Math.max(minYear, endYear - yearCount + 1)
  const points: WealthSeriesPoint[] = []
  for (let y = startYear; y <= endYear; y += 1) {
    points.push(
      wealthSeriesPointAt(db, String(y), String(y), wealthAsOfYearEndUtcExclusive(y)),
    )
  }
  return points
}

export type LedgerRow = {
  id: string
  kind: TransactionKind
  transferLeg: 'in' | 'out' | null
  amountCents: number
  transactionDate: string
  accountName: string
  categoryName: string | null
  description: string | null
}

export type LedgerSign = 'in' | 'out'

function signClause(sign: LedgerSign): string {
  if (sign === 'in') {
    return `(t.kind = 'income' OR (t.kind = 'transfer' AND t.transfer_leg = 'in'))`
  }
  return `(t.kind IN ('expense', 'investment') OR (t.kind = 'transfer' AND t.transfer_leg = 'out'))`
}

export function countLedgerInPeriod(
  db: Database,
  startUtc: string,
  endUtcExclusive: string,
  options: { kinds?: TransactionKind[]; sign?: LedgerSign } = {},
): number {
  const clauses = ['t.transaction_date >= ?', 't.transaction_date < ?']
  const params: (string | number)[] = [startUtc, endUtcExclusive]
  if (options.kinds && options.kinds.length > 0) {
    clauses.push(`t.kind IN (${options.kinds.map(() => '?').join(', ')})`)
    params.push(...options.kinds)
  }
  if (options.sign) {
    clauses.push(signClause(options.sign))
  }
  const stmt = db.prepare(
    `SELECT COUNT(*) AS c FROM ${TRANSACTION_TABLE} t WHERE ${clauses.join(' AND ')}`,
  )
  stmt.bind(params)
  stmt.step()
  const count = Number(stmt.getAsObject().c)
  stmt.free()
  return count
}

export function listLedgerInPeriod(
  db: Database,
  startUtc: string,
  endUtcExclusive: string,
  options: {
    kinds?: TransactionKind[]
    sign?: LedgerSign
    limit?: number
  } = {},
): LedgerRow[] {
  const clauses = ['t.transaction_date >= ?', 't.transaction_date < ?']
  const params: (string | number)[] = [startUtc, endUtcExclusive]
  if (options.kinds && options.kinds.length > 0) {
    clauses.push(`t.kind IN (${options.kinds.map(() => '?').join(', ')})`)
    params.push(...options.kinds)
  }
  if (options.sign) {
    clauses.push(signClause(options.sign))
  }
  const limit = options.limit ?? 15
  const sql = `
    SELECT
      t.id,
      t.kind,
      t.transfer_leg,
      t.amount_cents,
      t.transaction_date,
      t.description,
      a.name AS account_name,
      c.name AS category_name
    FROM ${TRANSACTION_TABLE} t
    INNER JOIN account a ON a.id = t.account_id
    LEFT JOIN category c ON c.id = t.category_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY t.transaction_date DESC, t.created_at DESC
    LIMIT ?
  `
  params.push(limit)
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows: LedgerRow[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    rows.push({
      id: String(row.id),
      kind: row.kind as TransactionKind,
      transferLeg: row.transfer_leg == null ? null : (row.transfer_leg as 'in' | 'out'),
      amountCents: Number(row.amount_cents),
      transactionDate: String(row.transaction_date),
      accountName: String(row.account_name),
      categoryName: row.category_name == null ? null : String(row.category_name),
      description: row.description == null ? null : String(row.description),
    })
  }
  stmt.free()
  return rows
}
