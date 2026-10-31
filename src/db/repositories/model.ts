import type { UtcIsoString } from '../../lib/datetime'
import type {
  CategoryType,
  RecurrenceKind,
  RebalancingDirection,
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
  rebalancingDirection: RebalancingDirection | null
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

export type DocumentCategoryRecord = {
  id: string
  name: string
  createdAt: UtcIsoString
}

export type DocumentTagSummary = {
  id: string
  name: string
}

export type DocumentRecord = {
  id: string
  referenceYear: number
  title: string
  fileName: string
  mimeType: string
  sizeBytes: number
  documentDate: UtcIsoString | null
  note: string | null
  createdAt: UtcIsoString
}

export type DocumentListItem = DocumentRecord & {
  tags: DocumentTagSummary[]
}

export type InstrumentRecord = {
  id: string
  isin: string | null
  quoteSymbol: string
  name: string
  createdAt: UtcIsoString
}

export type HoldingRecord = {
  id: string
  accountId: string
  instrumentId: string
  quantity: number
  totalCostCents: number
  updatedAt: UtcIsoString
}

export type HoldingListItem = HoldingRecord & {
  instrumentName: string
  instrumentIsin: string | null
  quoteSymbol: string
  accountName: string
}

export type HoldingPurchaseRecord = {
  id: string
  holdingId: string
  transactionId: string | null
  purchaseDate: UtcIsoString
  amountCents: number
  priceCentsPerUnit: number
  quantity: number
  createdAt: UtcIsoString
}

export type HoldingPurchaseListItem = HoldingPurchaseRecord & {
  instrumentName: string
  accountName: string
}
