import type { EntryKind } from '../components/transactions/EntryKindPicker'
import {
  signedAmountCents,
  type RebalancingDirection,
  type TransactionKind,
  type TransferLeg,
} from '../db/types'
import type { TransactionRecord } from '../db/repositories/model'

export function transactionSignedDelta(tx: TransactionRecord): number {
  return signedAmountCents(
    tx.kind,
    tx.amountCents,
    tx.transferLeg,
    tx.rebalancingDirection,
  )
}

export function projectBalanceAfterEntry(
  currentBalanceCents: number,
  originalDeltaCents: number,
  newDeltaCents: number,
): number {
  return currentBalanceCents - originalDeltaCents + newDeltaCents
}

export function signedDeltaForSimpleEntry(
  kind: Extract<TransactionKind, 'income' | 'expense' | 'investment'>,
  amountCents: number,
): number {
  return signedAmountCents(kind, amountCents, null, null)
}

export function signedDeltaForTransferLeg(
  leg: TransferLeg,
  amountCents: number,
): number {
  return signedAmountCents('transfer', amountCents, leg, null)
}

export type EntryFormDeltaInput = {
  kind: EntryKind
  amountCents: number | null
  accountId: string
  fromAccountId: string
  toAccountId: string
}

export function computeEntryPreviewDeltas(input: EntryFormDeltaInput): {
  primaryAccountId: string | null
  primaryDelta: number | null
  fromDelta: number | null
  toDelta: number | null
} {
  if (input.amountCents === null || input.amountCents <= 0) {
    return {
      primaryAccountId: null,
      primaryDelta: null,
      fromDelta: null,
      toDelta: null,
    }
  }
  if (input.kind === 'transfer') {
    if (!input.fromAccountId || !input.toAccountId) {
      return {
        primaryAccountId: null,
        primaryDelta: null,
        fromDelta: null,
        toDelta: null,
      }
    }
    return {
      primaryAccountId: null,
      primaryDelta: null,
      fromDelta: signedDeltaForTransferLeg('out', input.amountCents),
      toDelta: signedDeltaForTransferLeg('in', input.amountCents),
    }
  }
  if (!input.accountId) {
    return {
      primaryAccountId: null,
      primaryDelta: null,
      fromDelta: null,
      toDelta: null,
    }
  }
  return {
    primaryAccountId: input.accountId,
    primaryDelta: signedDeltaForSimpleEntry(input.kind, input.amountCents),
    fromDelta: null,
    toDelta: null,
  }
}

export function originalDeltaForEditingTransaction(
  tx: TransactionRecord | null,
): number {
  if (!tx) {
    return 0
  }
  return transactionSignedDelta(tx)
}

export function originalDeltasForEditingTransfer(legs: TransactionRecord[]): {
  fromDelta: number
  toDelta: number
} {
  let fromDelta = 0
  let toDelta = 0
  for (const leg of legs) {
    const delta = transactionSignedDelta(leg)
    if (leg.transferLeg === 'out') {
      fromDelta = delta
    } else if (leg.transferLeg === 'in') {
      toDelta = delta
    }
  }
  return { fromDelta, toDelta }
}

export function signedDeltaForRebalancingPreview(
  direction: RebalancingDirection,
  amountCents: number,
): number {
  return signedAmountCents('rebalancing', amountCents, null, direction)
}
