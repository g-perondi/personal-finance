export const TRANSACTION_KINDS = [
  'income',
  'expense',
  'investment',
  'transfer',
] as const
export type TransactionKind = (typeof TRANSACTION_KINDS)[number]

export const TRANSFER_LEGS = ['out', 'in'] as const
export type TransferLeg = (typeof TRANSFER_LEGS)[number]

export const CATEGORY_TYPES = ['income', 'expense'] as const
export type CategoryType = (typeof CATEGORY_TYPES)[number]

export const RECURRENCE_KINDS = ['recurring', 'variable'] as const
export type RecurrenceKind = (typeof RECURRENCE_KINDS)[number]

/** @deprecated Use RECURRENCE_KINDS */
export const EXPENSE_KINDS = RECURRENCE_KINDS
/** @deprecated Use RecurrenceKind */
export type ExpenseKind = RecurrenceKind

/** Signed cents delta for balance: opening_balance_cents + sum(deltas). */
export function signedAmountCents(
  kind: TransactionKind,
  amountCents: number,
  transferLeg: TransferLeg | null,
): number {
  switch (kind) {
    case 'income':
      return amountCents
    case 'expense':
    case 'investment':
      return -amountCents
    case 'transfer':
      if (transferLeg === 'in') {
        return amountCents
      }
      if (transferLeg === 'out') {
        return -amountCents
      }
      throw new Error('transfer transactions require transfer_leg in or out')
    default:
      throw new Error(`Unknown transaction kind: ${String(kind)}`)
  }
}
