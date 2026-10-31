export type EntryKind = 'income' | 'expense' | 'investment' | 'transfer'

const KINDS: EntryKind[] = ['expense', 'income', 'investment', 'transfer']

const LABELS: Record<EntryKind, string> = {
  expense: 'Expense',
  income: 'Income',
  investment: 'Investment',
  transfer: 'Transfer',
}

type EntryKindPickerProps = {
  value: EntryKind
  onChange: (kind: EntryKind) => void
  disabled?: boolean
  transferDisabled?: boolean
}

export function EntryKindPicker({
  value,
  onChange,
  disabled = false,
  transferDisabled = false,
}: EntryKindPickerProps) {
  return (
    <div
      className={`flex w-full flex-wrap justify-center gap-0.5 rounded-xl bg-slate-950/80 p-1 ring-1 ring-slate-700/60 ${
        disabled ? 'pointer-events-none opacity-50' : ''
      }`}
      role="group"
      aria-label="Transaction type"
    >
      {KINDS.map((kind) => {
        const optionDisabled = disabled || (kind === 'transfer' && transferDisabled)
        return (
          <button
            key={kind}
            type="button"
            disabled={optionDisabled}
            className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-all sm:px-3 ${
              value === kind
                ? 'bg-slate-100 text-slate-900 shadow-sm'
                : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400'
            }`}
            onClick={() => onChange(kind)}
          >
            {LABELS[kind]}
          </button>
        )
      })}
    </div>
  )
}
