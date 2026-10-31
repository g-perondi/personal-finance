import type { RecurrenceKind, TransactionKind } from './types'

export function recurrenceKindForTransactionKind(
  kind: TransactionKind,
  recurrenceKind: RecurrenceKind | null | undefined,
): RecurrenceKind | null {
  if (kind === 'transfer') {
    return null
  }
  if (kind === 'income' || kind === 'expense' || kind === 'investment') {
    if (recurrenceKind !== 'recurring' && recurrenceKind !== 'variable') {
      throw new Error(
        'Recurrence (recurring or variable) is required for this entry type.',
      )
    }
    return recurrenceKind
  }
  throw new Error(`Unknown transaction kind: ${String(kind)}`)
}

export function recurrenceKindLabel(kind: RecurrenceKind | null): string {
  if (kind === 'recurring') {
    return 'Recurring'
  }
  if (kind === 'variable') {
    return 'Variable'
  }
  return '—'
}
