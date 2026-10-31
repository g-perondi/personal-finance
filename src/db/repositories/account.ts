import type { Database } from 'sql.js'
import { schedulePersist } from '../database'
import { newId } from '../../lib/id'
import { TZDateMini } from '@date-fns/tz'
import {
  addDaysToRomeCalendarDate,
  currentRomeYear,
  DISPLAY_TIME_ZONE,
  romeDayUtcBounds,
  romeYearUtcBounds,
  todayRomeDateInputValue,
  toUtcIsoString,
  utcNowIso,
  normalizeStoredCalendarUtc,
  romeCalendarDateToUtcIso,
} from '../../lib/datetime'
import type { AccountRecord, AccountWithBalance } from './model'

export type { AccountWithBalance } from './model'
import { TRANSACTION_TABLE } from './sql'

const SIGNED_MOVEMENT_SUM_SQL = `
  CASE
    WHEN t.kind = 'income' THEN t.amount_cents
    WHEN t.kind IN ('expense', 'investment') THEN -t.amount_cents
    WHEN t.kind = 'transfer' AND t.transfer_leg = 'in' THEN t.amount_cents
    WHEN t.kind = 'transfer' AND t.transfer_leg = 'out' THEN -t.amount_cents
    ELSE 0
  END
`

const BALANCE_SUM_SQL = `
  COALESCE((
    SELECT SUM(${SIGNED_MOVEMENT_SUM_SQL})
    FROM ${TRANSACTION_TABLE} t
    WHERE t.account_id = account.id
  ), 0)
`

function mapAccountRow(row: Record<string, unknown>): AccountRecord {
  const openedRaw = row.opened_at ?? row.created_at
  return {
    id: String(row.id),
    name: String(row.name),
    openingBalanceCents: Number(row.opening_balance_cents),
    note: row.note == null ? null : String(row.note),
    openedAt: normalizeStoredCalendarUtc(String(openedRaw)),
    createdAt: toUtcIsoString(String(row.created_at)),
    archivedAt:
      row.archived_at == null ? null : toUtcIsoString(String(row.archived_at)),
  }
}

function selectAccountsSql(
  whereClause: string,
  orderBy: ListAccountsOptions['orderBy'] = 'name',
): string {
  return `
    SELECT
      account.id,
      account.name,
      account.opening_balance_cents,
      account.note,
      account.opened_at,
      account.created_at,
      account.archived_at,
      account.opening_balance_cents + ${BALANCE_SUM_SQL} AS balance_cents
    FROM account
    ${whereClause}
    ${listAccountsOrderClause(orderBy)}
  `
}

export type ListAccountsOptions = {
  includeArchived?: boolean
  /** Default `name` (case-insensitive). Use `balanceDesc` on the accounts page. */
  orderBy?: 'name' | 'balanceDesc'
  /** Adds `averageDailyBalanceYtdCents` for the current Rome calendar year (Jan 1 through today). */
  includeAverageDailyBalanceYtd?: boolean
}

function listAccountsOrderClause(orderBy: ListAccountsOptions['orderBy']): string {
  if (orderBy === 'balanceDesc') {
    return 'ORDER BY balance_cents DESC, account.name COLLATE NOCASE ASC'
  }
  return 'ORDER BY account.name COLLATE NOCASE ASC'
}

function lastDayIncludedInRomeCalendarYear(year: number): string | null {
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const today = todayRomeDateInputValue()
  if (year > currentRomeYear()) {
    return null
  }
  if (year < currentRomeYear()) {
    return yearEnd
  }
  if (today < yearStart) {
    return null
  }
  return today > yearEnd ? yearEnd : today
}

export function getAccountBalanceCentsAt(
  db: Database,
  accountId: string,
  asOfUtcExclusive: string,
): number {
  const stmt = db.prepare(`
    SELECT
      CASE
        WHEN account.opened_at >= ? THEN 0
        ELSE account.opening_balance_cents + COALESCE((
          SELECT SUM(${SIGNED_MOVEMENT_SUM_SQL})
          FROM ${TRANSACTION_TABLE} t
          WHERE t.account_id = account.id AND t.transaction_date < ?
        ), 0)
      END AS balance_cents
    FROM account
    WHERE account.id = ?
  `)
  stmt.bind([asOfUtcExclusive, asOfUtcExclusive, accountId])
  if (!stmt.step()) {
    stmt.free()
    return 0
  }
  const balance = Number(stmt.getAsObject().balance_cents)
  stmt.free()
  return balance
}

/**
 * Mean end-of-day balance for each Rome calendar day from 1 Jan through the last
 * included day in `year` (today for the current year). Days before `opened_at` are skipped.
 */
export function getAccountAverageDailyBalanceCentsForRomeCalendarYear(
  db: Database,
  account: AccountRecord,
  year: number,
): number {
  const lastDay = lastDayIncludedInRomeCalendarYear(year)
  if (lastDay === null) {
    return 0
  }
  const yearStart = `${year}-01-01`
  let sum = 0
  let dayCount = 0
  for (
    let date = yearStart;
    date <= lastDay;
    date = addDaysToRomeCalendarDate(date, 1)
  ) {
    const { endUtcExclusive } = romeDayUtcBounds(date)
    if (account.openedAt >= endUtcExclusive) {
      continue
    }
    sum += getAccountBalanceCentsAt(db, account.id, endUtcExclusive)
    dayCount += 1
  }
  if (dayCount === 0) {
    return 0
  }
  return Math.round(sum / dayCount)
}

/** Sum of `investment` amounts in the Rome calendar year through the last included day. */
export function getAccountInvestedCentsForRomeCalendarYear(
  db: Database,
  accountId: string,
  year: number,
): number {
  const lastDay = lastDayIncludedInRomeCalendarYear(year)
  if (lastDay === null) {
    return 0
  }
  const { startUtc } = romeYearUtcBounds(year)
  const { endUtcExclusive } = romeDayUtcBounds(lastDay)
  const stmt = db.prepare(`
    SELECT COALESCE(SUM(t.amount_cents), 0) AS invested_cents
    FROM ${TRANSACTION_TABLE} t
    WHERE t.account_id = ?
      AND t.kind = 'investment'
      AND t.transaction_date >= ?
      AND t.transaction_date < ?
  `)
  stmt.bind([accountId, startUtc, endUtcExclusive])
  stmt.step()
  const invested = Number(stmt.getAsObject().invested_cents)
  stmt.free()
  return invested
}

export function listAccounts(
  db: Database,
  options: ListAccountsOptions = {},
): AccountWithBalance[] {
  const {
    includeArchived = false,
    orderBy = 'name',
    includeAverageDailyBalanceYtd = false,
  } = options
  const where = includeArchived ? '' : 'WHERE account.archived_at IS NULL'
  const stmt = db.prepare(selectAccountsSql(where, orderBy))
  const rows: AccountWithBalance[] = []
  const ytdYear = currentRomeYear()
  while (stmt.step()) {
    const row = stmt.getAsObject()
    const record = mapAccountRow(row)
    rows.push({
      ...record,
      balanceCents: Number(row.balance_cents),
      ...(includeAverageDailyBalanceYtd
        ? {
            averageDailyBalanceYtdCents:
              getAccountAverageDailyBalanceCentsForRomeCalendarYear(
                db,
                record,
                ytdYear,
              ),
            investedYtdCents: getAccountInvestedCentsForRomeCalendarYear(
              db,
              record.id,
              ytdYear,
            ),
          }
        : {}),
    })
  }
  stmt.free()
  return rows
}

export function getAccountById(db: Database, id: string): AccountWithBalance | null {
  const stmt = db.prepare(
    `${selectAccountsSql('WHERE account.id = ?', 'name')} LIMIT 1`,
  )
  stmt.bind([id])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.getAsObject()
  stmt.free()
  return {
    ...mapAccountRow(row),
    balanceCents: Number(row.balance_cents),
  }
}

export function countAccountTransactions(db: Database, accountId: string): number {
  const stmt = db.prepare(
    `SELECT COUNT(*) AS count FROM ${TRANSACTION_TABLE} WHERE account_id = ?`,
  )
  stmt.bind([accountId])
  stmt.step()
  const row = stmt.getAsObject()
  stmt.free()
  return Number(row.count)
}

export type CreateAccountInput = {
  name: string
  openingBalanceCents: number
  note?: string | null
  /** Rome calendar `YYYY-MM-DD`; defaults to today in Europe/Rome. */
  openingDate?: string
}

export function createAccount(db: Database, input: CreateAccountInput): AccountRecord {
  const id = newId()
  const createdAt = utcNowIso()
  const openingDate = input.openingDate?.trim() || todayRomeDateInputValue()
  const openedAt = romeCalendarDateToUtcIso(openingDate)
  db.run(
    `INSERT INTO account (id, name, opening_balance_cents, note, opened_at, created_at, archived_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    [
      id,
      input.name.trim(),
      input.openingBalanceCents,
      input.note?.trim() || null,
      openedAt,
      createdAt,
    ],
  )
  schedulePersist()
  return {
    id,
    name: input.name.trim(),
    openingBalanceCents: input.openingBalanceCents,
    note: input.note?.trim() || null,
    openedAt,
    createdAt,
    archivedAt: null,
  }
}

export type UpdateAccountInput = {
  name: string
  openingBalanceCents?: number
  openingDate?: string
  note?: string | null
}

export function updateAccount(
  db: Database,
  id: string,
  input: UpdateAccountInput,
): void {
  const txCount = countAccountTransactions(db, id)
  if (txCount > 0) {
    db.run(`UPDATE account SET name = ?, note = ? WHERE id = ?`, [
      input.name.trim(),
      input.note?.trim() || null,
      id,
    ])
  } else {
    const opening = input.openingBalanceCents ?? 0
    const openedAt =
      input.openingDate !== undefined
        ? romeCalendarDateToUtcIso(input.openingDate.trim())
        : undefined
    if (openedAt !== undefined) {
      db.run(
        `UPDATE account SET name = ?, opening_balance_cents = ?, opened_at = ?, note = ? WHERE id = ?`,
        [input.name.trim(), opening, openedAt, input.note?.trim() || null, id],
      )
    } else {
      db.run(
        `UPDATE account SET name = ?, opening_balance_cents = ?, note = ? WHERE id = ?`,
        [input.name.trim(), opening, input.note?.trim() || null, id],
      )
    }
  }
  schedulePersist()
}

export function archiveAccount(db: Database, id: string): void {
  db.run(`UPDATE account SET archived_at = ? WHERE id = ?`, [utcNowIso(), id])
  schedulePersist()
}

export function unarchiveAccount(db: Database, id: string): void {
  db.run(`UPDATE account SET archived_at = NULL WHERE id = ?`, [id])
  schedulePersist()
}

/** Calendar year in Europe/Rome of the oldest account `opened_at`, or current year if none. */
export function getEarliestAccountYearInRome(db: Database): number {
  const stmt = db.prepare('SELECT MIN(opened_at) AS min_opened FROM account')
  stmt.step()
  const minOpened = stmt.getAsObject().min_opened
  stmt.free()
  if (minOpened == null) {
    return currentRomeYear()
  }
  const normalized = normalizeStoredCalendarUtc(String(minOpened))
  const inRome = new TZDateMini(new Date(normalized), DISPLAY_TIME_ZONE)
  return inRome.getFullYear()
}
