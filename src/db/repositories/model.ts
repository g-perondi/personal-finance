import type { UtcIsoString } from '../../lib/datetime'
import type {
  CategoryType,
  RecurrenceKind,
  TransactionKind,
  TransferLeg,
} from '../types'

export type AccountRecord = {
  id: string
  name: string
  openingBalanceCents: number
  note: string | null
  /** Start of opening calendar day in Europe/Rome (UTC ISO). */
  openedAt: UtcIsoString
  /** UTC ISO 8601 when the row was created in the app */
  createdAt: UtcIsoString
  /** UTC ISO 8601 when archived */
  archivedAt: UtcIsoString | null
}

export type AccountWithBalance = AccountRecord & {
  balanceCents: number
  /** Mean end-of-day balance for elapsed days in the Rome calendar year (accounts list only). */
  averageDailyBalanceYtdCents?: number
  /** Sum of investment movements in the Rome calendar year (accounts list only). */
  investedYtdCents?: number
}

export type CategoryRecord = {
  id: string
  name: string
  type: CategoryType
  defaultRecurrenceKind: RecurrenceKind | null
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
  recurrenceKind: RecurrenceKind | null
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
