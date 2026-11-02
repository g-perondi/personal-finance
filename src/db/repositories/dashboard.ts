import type { Database } from 'sql.js'
import { TRANSACTION_SIGNED_DELTA_SQL } from '../types'
import type { MonthTotals } from '../../lib/savings'
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
import type { RebalancingDirection, TransactionKind } from '../types'
import { TRANSACTION_TABLE } from './sql'

const SIGNED_DELTA_SQL = TRANSACTION_SIGNED_DELTA_SQL

export function getPeriodTotals(
  db: Database,
  startUtc: string,
  endUtcExclusive: string,
): MonthTotals {
  const stmt = db.prepare(`
    SELECT
      COALESCE(SUM(CASE
        WHEN kind = 'income'
          OR (kind = 'rebalancing' AND rebalancing_direction = 'increase')
        THEN amount_cents ELSE 0 END), 0) AS income_cents,
      COALESCE(SUM(CASE
        WHEN kind = 'expense'
          OR (kind = 'rebalancing' AND rebalancing_direction = 'decrease')
        THEN amount_cents ELSE 0 END), 0) AS expense_cents,
      COALESCE(SUM(CASE
        WHEN kind = 'investment' AND affects_balance != 0 THEN amount_cents
        ELSE 0 END), 0) AS investment_cents
    FROM ${TRANSACTION_TABLE}
    WHERE transaction_date >= ? AND transaction_date < ?
  `)
  stmt.bind([startUtc, endUtcExclusive])
  if (!stmt.step()) {
    stmt.free()
    return { incomeCents: 0, expenseCents: 0, investmentCents: 0 }
  }
  const row = stmt.getAsObject()
  stmt.free()
  return {
    incomeCents: Number(row.income_cents),
    expenseCents: Number(row.expense_cents),
    investmentCents: Number(row.investment_cents),
  }
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

/** ETF cost basis from purchases recorded before `asOfUtcExclusive`. */
export function getHoldingsCostBasisCentsAt(
  db: Database,
  asOfUtcExclusive: string,
): number {
  const stmt = db.prepare(`
    SELECT COALESCE(SUM(p.amount_cents), 0) AS basis_cents
    FROM holding_purchase p
    INNER JOIN holding h ON h.id = p.holding_id
    INNER JOIN account a ON a.id = h.account_id
    WHERE a.archived_at IS NULL
      AND a.opened_at < ?
      AND p.purchase_date < ?
  `)
  stmt.bind([asOfUtcExclusive, asOfUtcExclusive])
  stmt.step()
  const basis = Number(stmt.getAsObject().basis_cents)
  stmt.free()
  return basis
}

/** Ledger investments not already counted via `holding_purchase.transaction_id`. */
export function getOrphanInvestmentCentsAt(
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
      AND NOT EXISTS (
        SELECT 1 FROM holding_purchase hp WHERE hp.transaction_id = t.id
      )
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
  const accountWealthCents = getTotalWealthCentsAt(db, asOfUtcExclusive)
  const holdingsBasisCents = getHoldingsCostBasisCentsAt(db, asOfUtcExclusive)
  const orphanInvestmentCents = getOrphanInvestmentCentsAt(db, asOfUtcExclusive)
  const investmentCents = holdingsBasisCents + orphanInvestmentCents
  const totalCents = accountWealthCents + holdingsBasisCents
  return {
    key,
    label,
    totalCents,
    investmentCents,
    cashCents: totalCents - investmentCents,
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
  rebalancingDirection: RebalancingDirection | null
  affectsBalance: boolean
  amountCents: number
  transactionDate: string
  accountName: string
  categoryName: string | null
  description: string | null
}

export type LedgerSign = 'in' | 'out'

function signClause(sign: LedgerSign): string {
  if (sign === 'in') {
    return `(t.kind = 'income' OR (t.kind = 'transfer' AND t.transfer_leg = 'in') OR (t.kind = 'rebalancing' AND t.rebalancing_direction = 'increase') OR (t.kind = 'investment' AND t.affects_balance = 0))`
  }
  return `(t.kind = 'expense' OR (t.kind = 'investment' AND t.affects_balance != 0) OR (t.kind = 'transfer' AND t.transfer_leg = 'out') OR (t.kind = 'rebalancing' AND t.rebalancing_direction = 'decrease'))`
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
      t.rebalancing_direction,
      t.affects_balance,
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
      rebalancingDirection:
        row.rebalancing_direction === 'increase' ||
        row.rebalancing_direction === 'decrease'
          ? row.rebalancing_direction
          : null,
      affectsBalance: Number(row.affects_balance) !== 0,
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
