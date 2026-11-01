import type { Database } from 'sql.js'
import { schedulePersist } from '../database'
import { newId } from '../../lib/id'
import { TZDateMini } from '@date-fns/tz'
import {
  addDaysToRomeCalendarDate,
  currentRomeYear,
  getDisplayTimeZone,
  romeDayUtcBounds,
  romeYearUtcBounds,
  todayRomeDateInputValue,
  toUtcIsoString,
  utcNowIso,
  normalizeStoredCalendarUtc,
  parseCalendarDateForStorage,
  romeCalendarDateToUtcIso,
} from '../../lib/datetime'
import type { AccountRecord, AccountWithBalance } from './model'
import { getHoldingsMarketValueCentsByAccountId } from './holding'
import { deleteSimpleTransaction } from './transaction'

/** Placeholder account id kept for transfer FK integrity after an account is deleted. */
export const DELETED_ACCOUNT_PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000001'

export function isDeletedAccountPlaceholderId(id: string): boolean {
  return id === DELETED_ACCOUNT_PLACEHOLDER_ID
}

export type { AccountWithBalance } from './model'
import { TRANSACTION_SIGNED_DELTA_SQL } from '../types'
import { TRANSACTION_TABLE } from './sql'

const SIGNED_MOVEMENT_SUM_SQL = TRANSACTION_SIGNED_DELTA_SQL

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
    isPrimary: Number(row.is_primary ?? 0) === 1,
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
      account.is_primary,
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
  const primaryFirst = 'account.is_primary DESC'
  if (orderBy === 'balanceDesc') {
    return `ORDER BY ${primaryFirst}, balance_cents DESC, account.name COLLATE NOCASE ASC`
  }
  return `ORDER BY ${primaryFirst}, account.name COLLATE NOCASE ASC`
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
  const where = includeArchived
    ? `WHERE account.id != '${DELETED_ACCOUNT_PLACEHOLDER_ID}'`
    : `WHERE account.archived_at IS NULL AND account.id != '${DELETED_ACCOUNT_PLACEHOLDER_ID}'`
  const stmt = db.prepare(selectAccountsSql(where, orderBy))
  const rows: AccountWithBalance[] = []
  const ytdYear = currentRomeYear()
  const holdingsMarketByAccount = includeAverageDailyBalanceYtd
    ? getHoldingsMarketValueCentsByAccountId(db)
    : null
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
            holdingsMarketValueCents: holdingsMarketByAccount?.has(record.id)
              ? holdingsMarketByAccount.get(record.id)!
              : 0,
          }
        : {}),
    })
  }
  stmt.free()
  return rows
}

/** Id of the non-archived primary account, if any. */
export function getPrimaryAccountId(db: Database): string | null {
  const stmt = db.prepare(`
    SELECT id FROM account
    WHERE is_primary = 1 AND archived_at IS NULL AND id != ?
    LIMIT 1
  `)
  stmt.bind([DELETED_ACCOUNT_PLACEHOLDER_ID])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const id = String(stmt.getAsObject().id)
  stmt.free()
  return id
}

function setAccountPrimary(db: Database, accountId: string, isPrimary: boolean): void {
  if (isPrimary) {
    db.run(`UPDATE account SET is_primary = 0 WHERE id != ?`, [accountId])
    db.run(`UPDATE account SET is_primary = 1 WHERE id = ?`, [accountId])
  } else {
    db.run(`UPDATE account SET is_primary = 0 WHERE id = ?`, [accountId])
  }
}

function countNonArchivedAccounts(db: Database): number {
  const stmt = db.prepare(
    `SELECT COUNT(*) AS count FROM account
     WHERE archived_at IS NULL AND id != ?`,
  )
  stmt.bind([DELETED_ACCOUNT_PLACEHOLDER_ID])
  stmt.step()
  const count = Number(stmt.getAsObject().count)
  stmt.free()
  return count
}

function ensureDeletedAccountPlaceholder(db: Database): void {
  if (getAccountById(db, DELETED_ACCOUNT_PLACEHOLDER_ID)) {
    return
  }
  const createdAt = utcNowIso()
  const openedAt = romeCalendarDateToUtcIso('1970-01-01')
  db.run(
    `INSERT INTO account (
      id, name, opening_balance_cents, note, opened_at, created_at, archived_at, is_primary
    ) VALUES (?, '(deleted)', 0, NULL, ?, ?, ?, 0)`,
    [DELETED_ACCOUNT_PLACEHOLDER_ID, openedAt, createdAt, createdAt],
  )
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

export function getAccountBalanceCents(db: Database, accountId: string): number {
  const account = getAccountById(db, accountId)
  if (!account) {
    throw new Error('Account not found.')
  }
  return account.balanceCents
}

export type RebalanceAccountInput = {
  accountId: string
  targetBalanceCents: number
  transactionDate: string
  description?: string | null
}

export function rebalanceAccount(db: Database, input: RebalanceAccountInput): void {
  if (input.targetBalanceCents < 0) {
    throw new Error('Target balance cannot be negative.')
  }
  const current = getAccountBalanceCents(db, input.accountId)
  const delta = input.targetBalanceCents - current
  if (delta === 0) {
    throw new Error('Target balance already matches the ledger.')
  }
  const direction = delta > 0 ? 'increase' : 'decrease'
  const amountCents = Math.abs(delta)
  const id = newId()
  const createdAt = utcNowIso()
  const transactionDate = parseCalendarDateForStorage(input.transactionDate)
  db.run(
    `INSERT INTO ${TRANSACTION_TABLE} (
      id, account_id, kind, amount_cents, transfer_leg, transfer_id,
      category_id, recurrence_kind, rebalancing_direction, transaction_date, description, created_at
    ) VALUES (?, ?, 'rebalancing', ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?)`,
    [
      id,
      input.accountId,
      amountCents,
      direction,
      transactionDate,
      input.description?.trim() || 'Balance reconciliation',
      createdAt,
    ],
  )
  schedulePersist()
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
  isPrimary?: boolean
}

export function createAccount(db: Database, input: CreateAccountInput): AccountRecord {
  const id = newId()
  const createdAt = utcNowIso()
  const openingDate = input.openingDate?.trim() || todayRomeDateInputValue()
  const openedAt = romeCalendarDateToUtcIso(openingDate)
  const makePrimary =
    input.isPrimary === true ||
    (input.isPrimary !== false && countNonArchivedAccounts(db) === 0)
  if (makePrimary) {
    db.run(`UPDATE account SET is_primary = 0`)
  }
  db.run(
    `INSERT INTO account (id, name, opening_balance_cents, note, opened_at, created_at, archived_at, is_primary)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      id,
      input.name.trim(),
      input.openingBalanceCents,
      input.note?.trim() || null,
      openedAt,
      createdAt,
      makePrimary ? 1 : 0,
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
    isPrimary: makePrimary,
  }
}

export type UpdateAccountInput = {
  name: string
  openingBalanceCents?: number
  openingDate?: string
  note?: string | null
  isPrimary?: boolean
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
  if (input.isPrimary !== undefined) {
    setAccountPrimary(db, id, input.isPrimary)
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

/**
 * Permanently removes an account and all ledger data on it. Transfers involving other
 * accounts keep the remaining leg; the deleted side is labeled on `transfer` for display.
 */
export function deleteAccount(db: Database, id: string): void {
  if (isDeletedAccountPlaceholderId(id)) {
    throw new Error('This account cannot be deleted.')
  }
  const account = getAccountById(db, id)
  if (!account) {
    throw new Error('Account not found.')
  }

  ensureDeletedAccountPlaceholder(db)
  const accountName = account.name
  const txIds: string[] = []

  db.run('BEGIN')
  try {
    db.run(
      `DELETE FROM ${TRANSACTION_TABLE}
       WHERE account_id = ? AND transfer_id IS NOT NULL`,
      [id],
    )
    db.run(
      `UPDATE transfer
       SET from_account_id = ?, from_account_deleted_label = ?
       WHERE from_account_id = ?`,
      [DELETED_ACCOUNT_PLACEHOLDER_ID, accountName, id],
    )
    db.run(
      `UPDATE transfer
       SET to_account_id = ?, to_account_deleted_label = ?
       WHERE to_account_id = ?`,
      [DELETED_ACCOUNT_PLACEHOLDER_ID, accountName, id],
    )

    const txStmt = db.prepare(
      `SELECT id FROM ${TRANSACTION_TABLE} WHERE account_id = ?`,
    )
    txStmt.bind([id])
    while (txStmt.step()) {
      txIds.push(String(txStmt.getAsObject().id))
    }
    txStmt.free()

    db.run('COMMIT')
  } catch (error: unknown) {
    db.run('ROLLBACK')
    throw error
  }

  for (const txId of txIds) {
    deleteSimpleTransaction(db, txId)
  }

  db.run(`DELETE FROM holding WHERE account_id = ?`, [id])

  if (account.isPrimary) {
    const remaining = listAccounts(db).filter((row) => row.id !== id)
    if (remaining.length > 0) {
      setAccountPrimary(db, remaining[0]!.id, true)
    }
  }

  db.run(`DELETE FROM account WHERE id = ?`, [id])
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
  const inRome = new TZDateMini(new Date(normalized), getDisplayTimeZone())
  return inRome.getFullYear()
}
