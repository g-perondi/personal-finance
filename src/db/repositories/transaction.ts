import type { Database } from 'sql.js'
import type { RecurrenceKind, RebalancingDirection, TransactionKind } from '../types'
import { recurrenceKindForTransactionKind } from '../recurrence'
import { schedulePersist } from '../database'
import { newId } from '../../lib/id'
import { appendTransactionSearchClauses } from '../../lib/document-search-query'
import {
  normalizeStoredCalendarUtc,
  parseCalendarDateForStorage,
  toUtcIsoString,
  utcNowIso,
} from '../../lib/datetime'
import type { TransactionListItem, TransactionRecord } from './model'
import { reverseHoldingPurchaseForTransaction } from './holding'
import { TRANSACTION_TABLE } from './sql'

function mapRecurrenceKind(row: Record<string, unknown>): RecurrenceKind | null {
  const raw = row.recurrence_kind ?? row.expense_kind
  if (raw === 'recurring' || raw === 'variable') {
    return raw
  }
  return null
}

function mapRebalancingDirection(
  row: Record<string, unknown>,
): RebalancingDirection | null {
  const raw = row.rebalancing_direction
  if (raw === 'increase' || raw === 'decrease') {
    return raw
  }
  return null
}

function mapAffectsBalance(row: Record<string, unknown>): boolean {
  if (row.affects_balance === undefined || row.affects_balance === null) {
    return true
  }
  return Number(row.affects_balance) !== 0
}

function mapTransactionRow(row: Record<string, unknown>): TransactionRecord {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    kind: row.kind as TransactionKind,
    amountCents: Number(row.amount_cents),
    transferLeg: row.transfer_leg == null ? null : (row.transfer_leg as 'in' | 'out'),
    transferId: row.transfer_id == null ? null : String(row.transfer_id),
    categoryId: row.category_id == null ? null : String(row.category_id),
    recurrenceKind: mapRecurrenceKind(row),
    rebalancingDirection: mapRebalancingDirection(row),
    affectsBalance: mapAffectsBalance(row),
    transactionDate: normalizeStoredCalendarUtc(String(row.transaction_date)),
    description: row.description == null ? null : String(row.description),
    createdAt: toUtcIsoString(String(row.created_at)),
  }
}

const LIST_SELECT = `
  SELECT
    t.id,
    t.account_id,
    t.kind,
    t.amount_cents,
    t.transfer_leg,
    t.transfer_id,
    t.category_id,
    t.recurrence_kind,
    t.rebalancing_direction,
    t.affects_balance,
    t.transaction_date,
    t.description,
    t.created_at,
    a.name AS account_name,
    c.name AS category_name,
    CASE
      WHEN t.kind = 'transfer' AND t.transfer_leg = 'in' THEN
        CASE
          WHEN tr.from_account_deleted_label IS NOT NULL AND TRIM(tr.from_account_deleted_label) != ''
          THEN tr.from_account_deleted_label || ' (deleted)'
          ELSE tr_from.name
        END
      WHEN t.kind = 'transfer' AND t.transfer_leg = 'out' THEN
        CASE
          WHEN tr.to_account_deleted_label IS NOT NULL AND TRIM(tr.to_account_deleted_label) != ''
          THEN tr.to_account_deleted_label || ' (deleted)'
          ELSE tr_to.name
        END
      ELSE NULL
    END AS transfer_counterparty_name
  FROM ${TRANSACTION_TABLE} t
  INNER JOIN account a ON a.id = t.account_id
  LEFT JOIN category c ON c.id = t.category_id
  LEFT JOIN transfer tr ON tr.id = t.transfer_id
  LEFT JOIN account tr_from ON tr_from.id = tr.from_account_id
  LEFT JOIN account tr_to ON tr_to.id = tr.to_account_id
`

export type ListTransactionsOptions = {
  accountId?: string
  kind?: TransactionKind
  startUtc?: string
  endUtcExclusive?: string
  limit?: number
  searchQuery?: string | null
}

export function listTransactions(
  db: Database,
  options: ListTransactionsOptions = {},
): TransactionListItem[] {
  const clauses: string[] = []
  const params: (string | number)[] = []

  if (options.accountId) {
    clauses.push('t.account_id = ?')
    params.push(options.accountId)
  }
  if (options.kind) {
    clauses.push('t.kind = ?')
    params.push(options.kind)
  }
  if (options.startUtc) {
    clauses.push('t.transaction_date >= ?')
    params.push(options.startUtc)
  }
  if (options.endUtcExclusive) {
    clauses.push('t.transaction_date < ?')
    params.push(options.endUtcExclusive)
  }
  appendTransactionSearchClauses(clauses, params, options.searchQuery, {
    includeTransferDeletedAccountLabels: true,
  })

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = options.limit ?? 200
  const sql = `${LIST_SELECT} ${where} ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT ?`
  params.push(limit)

  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows: TransactionListItem[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    rows.push({
      ...mapTransactionRow(row),
      accountName: String(row.account_name),
      categoryName: row.category_name == null ? null : String(row.category_name),
      transferCounterpartyName:
        row.transfer_counterparty_name == null
          ? null
          : String(row.transfer_counterparty_name),
    })
  }
  stmt.free()
  return rows
}

export function getTransactionById(db: Database, id: string): TransactionRecord | null {
  const stmt = db.prepare(`SELECT * FROM ${TRANSACTION_TABLE} WHERE id = ? LIMIT 1`)
  stmt.bind([id])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = mapTransactionRow(stmt.getAsObject())
  stmt.free()
  return row
}

export type SimpleTransactionInput = {
  accountId: string
  kind: Extract<TransactionKind, 'income' | 'expense' | 'investment'>
  amountCents: number
  transactionDate: string
  description?: string | null
  categoryId?: string | null
  recurrenceKind?: RecurrenceKind | null
  /** Defaults to true. Investment rows may set false when cash is not spent on the account. */
  affectsBalance?: boolean
}

export function createSimpleTransaction(
  db: Database,
  input: SimpleTransactionInput,
): TransactionRecord {
  if (input.amountCents <= 0) {
    throw new Error('Amount must be greater than zero.')
  }
  const id = newId()
  const createdAt = utcNowIso()
  const transactionDate = parseCalendarDateForStorage(input.transactionDate)
  const recurrenceKind = recurrenceKindForTransactionKind(
    input.kind,
    input.recurrenceKind,
  )
  const affectsBalance = input.affectsBalance !== false
  db.run(
    `INSERT INTO ${TRANSACTION_TABLE} (
      id, account_id, kind, amount_cents, transfer_leg, transfer_id,
      category_id, recurrence_kind, rebalancing_direction, affects_balance,
      transaction_date, description, created_at
    ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, NULL, ?, ?, ?, ?)`,
    [
      id,
      input.accountId,
      input.kind,
      input.amountCents,
      input.categoryId ?? null,
      recurrenceKind,
      affectsBalance ? 1 : 0,
      transactionDate,
      input.description?.trim() || null,
      createdAt,
    ],
  )
  schedulePersist()
  return getTransactionById(db, id)!
}

export function updateSimpleTransaction(
  db: Database,
  id: string,
  input: Omit<SimpleTransactionInput, 'kind'> & {
    kind: SimpleTransactionInput['kind']
  },
): void {
  const existing = getTransactionById(db, id)
  if (!existing || existing.kind === 'transfer' || existing.kind === 'rebalancing') {
    throw new Error('Transaction not found or not editable.')
  }
  if (input.amountCents <= 0) {
    throw new Error('Amount must be greater than zero.')
  }
  const transactionDate = parseCalendarDateForStorage(input.transactionDate)
  const recurrenceKind = recurrenceKindForTransactionKind(
    input.kind,
    input.recurrenceKind,
  )
  const affectsBalance =
    input.affectsBalance === undefined ? existing.affectsBalance : input.affectsBalance
  db.run(
    `UPDATE ${TRANSACTION_TABLE}
     SET account_id = ?, kind = ?, amount_cents = ?, category_id = ?,
         recurrence_kind = ?, affects_balance = ?, transaction_date = ?, description = ?
     WHERE id = ?`,
    [
      input.accountId,
      input.kind,
      input.amountCents,
      input.categoryId ?? null,
      recurrenceKind,
      affectsBalance ? 1 : 0,
      transactionDate,
      input.description?.trim() || null,
      id,
    ],
  )
  schedulePersist()
}

export function deleteSimpleTransaction(db: Database, id: string): void {
  const existing = getTransactionById(db, id)
  if (!existing || existing.kind === 'transfer') {
    throw new Error('Transaction not found or must be deleted via transfer.')
  }
  if (existing.kind === 'investment') {
    reverseHoldingPurchaseForTransaction(db, id)
  }
  db.run(`DELETE FROM ${TRANSACTION_TABLE} WHERE id = ?`, [id])
  schedulePersist()
}

export function listTransactionsByTransferId(
  db: Database,
  transferId: string,
): TransactionRecord[] {
  const stmt = db.prepare(`SELECT * FROM ${TRANSACTION_TABLE} WHERE transfer_id = ?`)
  stmt.bind([transferId])
  const rows: TransactionRecord[] = []
  while (stmt.step()) {
    rows.push(mapTransactionRow(stmt.getAsObject()))
  }
  stmt.free()
  return rows
}
