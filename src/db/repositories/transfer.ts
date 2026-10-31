import type { Database } from 'sql.js'
import { schedulePersist } from '../database'
import { newId } from '../../lib/id'
import { parseCalendarDateForStorage, utcNowIso } from '../../lib/datetime'
import { TRANSACTION_TABLE } from './sql'
import { listTransactionsByTransferId } from './transaction'

export type CreateTransferInput = {
  fromAccountId: string
  toAccountId: string
  amountCents: number
  transferDate: string
  note?: string | null
}

export type TransferRecord = {
  id: string
  fromAccountId: string
  toAccountId: string
  amountCents: number
  transferDate: string
  note: string | null
  createdAt: string
}

function assertDistinctAccounts(fromAccountId: string, toAccountId: string): void {
  if (fromAccountId === toAccountId) {
    throw new Error('From and to account must be different.')
  }
}

export function createTransfer(
  db: Database,
  input: CreateTransferInput,
): TransferRecord {
  assertDistinctAccounts(input.fromAccountId, input.toAccountId)
  if (input.amountCents <= 0) {
    throw new Error('Amount must be greater than zero.')
  }

  const transferId = newId()
  const outTxId = newId()
  const inTxId = newId()
  const createdAt = utcNowIso()
  const transferDate = parseCalendarDateForStorage(input.transferDate)

  db.run('BEGIN')
  try {
    db.run(
      `INSERT INTO transfer (
        id, from_account_id, to_account_id, amount_cents, transfer_date, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        transferId,
        input.fromAccountId,
        input.toAccountId,
        input.amountCents,
        transferDate,
        input.note?.trim() || null,
        createdAt,
      ],
    )

    db.run(
      `INSERT INTO ${TRANSACTION_TABLE} (
        id, account_id, kind, amount_cents, transfer_leg, transfer_id,
        category_id, recurrence_kind, rebalancing_direction, transaction_date, description, created_at
      ) VALUES (?, ?, 'transfer', ?, 'out', ?, NULL, NULL, NULL, ?, ?, ?)`,
      [
        outTxId,
        input.fromAccountId,
        input.amountCents,
        transferId,
        transferDate,
        input.note?.trim() || null,
        createdAt,
      ],
    )

    db.run(
      `INSERT INTO ${TRANSACTION_TABLE} (
        id, account_id, kind, amount_cents, transfer_leg, transfer_id,
        category_id, recurrence_kind, rebalancing_direction, transaction_date, description, created_at
      ) VALUES (?, ?, 'transfer', ?, 'in', ?, NULL, NULL, NULL, ?, ?, ?)`,
      [
        inTxId,
        input.toAccountId,
        input.amountCents,
        transferId,
        transferDate,
        input.note?.trim() || null,
        createdAt,
      ],
    )

    db.run('COMMIT')
  } catch (error: unknown) {
    db.run('ROLLBACK')
    throw error
  }

  schedulePersist()

  return {
    id: transferId,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amountCents: input.amountCents,
    transferDate,
    note: input.note?.trim() || null,
    createdAt,
  }
}

export function deleteTransfer(db: Database, transferId: string): void {
  db.run('BEGIN')
  try {
    db.run(`DELETE FROM ${TRANSACTION_TABLE} WHERE transfer_id = ?`, [transferId])
    db.run(`DELETE FROM transfer WHERE id = ?`, [transferId])
    db.run('COMMIT')
  } catch (error: unknown) {
    db.run('ROLLBACK')
    throw error
  }
  schedulePersist()
}

export function updateTransfer(
  db: Database,
  transferId: string,
  input: CreateTransferInput,
): void {
  deleteTransfer(db, transferId)
  createTransfer(db, { ...input })
}

export function getTransferLegs(db: Database, transferId: string) {
  return listTransactionsByTransferId(db, transferId)
}
