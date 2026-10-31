import type { UtcIsoString } from '../../lib/datetime'
import type { CategoryType, TransactionKind, TransferLeg } from '../types'

export type AccountRecord = {
  id: string
  name: string
  openingBalanceCents: number
  note: string | null
  /** UTC ISO 8601 */
  createdAt: UtcIsoString
  /** UTC ISO 8601 when archived */
  archivedAt: UtcIsoString | null
}

export type AccountWithBalance = AccountRecord & {
  balanceCents: number
}

export type CategoryRecord = {
  id: string
  name: string
  type: CategoryType
  /** UTC ISO 8601 */
  createdAt: UtcIsoString
}

export type TransactionRecord = {
  id: string
  accountId: string
  kind: TransactionKind
  amountCents: number
  transferLeg: TransferLeg | null
  transferId: string | null
  categoryId: string | null
  expenseKind: null
  /** UTC ISO 8601 (start of calendar day in Europe/Rome) */
  transactionDate: UtcIsoString
  description: string | null
  /** UTC ISO 8601 */
  createdAt: UtcIsoString
}

export type TransactionListItem = TransactionRecord & {
  accountName: string
  categoryName: string | null
}
