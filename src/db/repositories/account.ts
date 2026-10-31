import type { Database } from 'sql.js'
import { schedulePersist } from '../database'
import { newId } from '../../lib/id'
import { toUtcIsoString, utcNowIso } from '../../lib/datetime'
import type { AccountRecord, AccountWithBalance } from './model'

export type { AccountWithBalance } from './model'
import { TRANSACTION_TABLE } from './sql'

const BALANCE_SUM_SQL = `
  COALESCE((
    SELECT SUM(
      CASE
        WHEN t.kind = 'income' THEN t.amount_cents
        WHEN t.kind IN ('expense', 'investment') THEN -t.amount_cents
        WHEN t.kind = 'transfer' AND t.transfer_leg = 'in' THEN t.amount_cents
        WHEN t.kind = 'transfer' AND t.transfer_leg = 'out' THEN -t.amount_cents
        ELSE 0
      END
    )
    FROM ${TRANSACTION_TABLE} t
    WHERE t.account_id = account.id
  ), 0)
`

function mapAccountRow(row: Record<string, unknown>): AccountRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    openingBalanceCents: Number(row.opening_balance_cents),
    note: row.note == null ? null : String(row.note),
    createdAt: toUtcIsoString(String(row.created_at)),
    archivedAt:
      row.archived_at == null ? null : toUtcIsoString(String(row.archived_at)),
  }
}

function selectAccountsSql(whereClause: string): string {
  return `
    SELECT
      account.id,
      account.name,
      account.opening_balance_cents,
      account.note,
      account.created_at,
      account.archived_at,
      account.opening_balance_cents + ${BALANCE_SUM_SQL} AS balance_cents
    FROM account
    ${whereClause}
    ORDER BY account.name COLLATE NOCASE ASC
  `
}

export function listAccounts(
  db: Database,
  options: { includeArchived?: boolean } = {},
): AccountWithBalance[] {
  const where = options.includeArchived ? '' : 'WHERE account.archived_at IS NULL'
  const stmt = db.prepare(selectAccountsSql(where))
  const rows: AccountWithBalance[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    rows.push({
      ...mapAccountRow(row),
      balanceCents: Number(row.balance_cents),
    })
  }
  stmt.free()
  return rows
}

export function getAccountById(db: Database, id: string): AccountWithBalance | null {
  const stmt = db.prepare(`${selectAccountsSql('WHERE account.id = ?')} LIMIT 1`)
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
}

export function createAccount(db: Database, input: CreateAccountInput): AccountRecord {
  const id = newId()
  const createdAt = utcNowIso()
  db.run(
    `INSERT INTO account (id, name, opening_balance_cents, note, created_at, archived_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    [
      id,
      input.name.trim(),
      input.openingBalanceCents,
      input.note?.trim() || null,
      createdAt,
    ],
  )
  schedulePersist()
  return {
    id,
    name: input.name.trim(),
    openingBalanceCents: input.openingBalanceCents,
    note: input.note?.trim() || null,
    createdAt,
    archivedAt: null,
  }
}

export type UpdateAccountInput = {
  name: string
  openingBalanceCents?: number
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
    db.run(
      `UPDATE account SET name = ?, opening_balance_cents = ?, note = ? WHERE id = ?`,
      [input.name.trim(), opening, input.note?.trim() || null, id],
    )
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
