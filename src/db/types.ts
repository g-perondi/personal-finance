export const TRANSACTION_KINDS = [
  'income',
  'expense',
  'investment',
  'transfer',
  'rebalancing',
] as const
export type TransactionKind = (typeof TRANSACTION_KINDS)[number]

export const TRANSFER_LEGS = ['out', 'in'] as const
export type TransferLeg = (typeof TRANSFER_LEGS)[number]

export const REBALANCING_DIRECTIONS = ['increase', 'decrease'] as const
export type RebalancingDirection = (typeof REBALANCING_DIRECTIONS)[number]

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
  rebalancingDirection: RebalancingDirection | null = null,
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
    case 'rebalancing':
      if (rebalancingDirection === 'increase') {
        return amountCents
      }
      if (rebalancingDirection === 'decrease') {
        return -amountCents
      }
      throw new Error('rebalancing transactions require rebalancing_direction')
    default:
      throw new Error(`Unknown transaction kind: ${String(kind)}`)
  }
}

/** SQL CASE fragment: alias `t` for transaction row. */
export const TRANSACTION_SIGNED_DELTA_SQL = `
  CASE
    WHEN t.kind = 'income' THEN t.amount_cents
    WHEN t.kind IN ('expense', 'investment') THEN -t.amount_cents
    WHEN t.kind = 'transfer' AND t.transfer_leg = 'in' THEN t.amount_cents
    WHEN t.kind = 'transfer' AND t.transfer_leg = 'out' THEN -t.amount_cents
    WHEN t.kind = 'rebalancing' AND t.rebalancing_direction = 'increase' THEN t.amount_cents
    WHEN t.kind = 'rebalancing' AND t.rebalancing_direction = 'decrease' THEN -t.amount_cents
    ELSE 0
  END
`
