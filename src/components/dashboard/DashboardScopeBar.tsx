import type { DashboardScope } from '../../lib/dashboard-period'

const SCOPES: DashboardScope[] = ['global', 'year', 'month', 'day']

const LABELS: Record<DashboardScope, string> = {
  global: 'Global',
  year: 'Year',
  month: 'Month',
  day: 'Day',
}

type DashboardScopeBarProps = {
  scope: DashboardScope
  onScopeChange: (scope: DashboardScope) => void
}

export function DashboardScopeBar({ scope, onScopeChange }: DashboardScopeBarProps) {
  return (
    <div
      className="inline-flex max-w-full flex-wrap justify-center gap-0.5 rounded-xl bg-slate-950/80 p-1 ring-1 ring-slate-700/60"
      role="group"
      aria-label="Dashboard period scope"
    >
      {SCOPES.map((value) => (
        <button
          key={value}
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-all ${
            scope === value
              ? 'bg-slate-100 text-slate-900 shadow-sm'
              : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
          }`}
          onClick={() => onScopeChange(value)}
        >
          {LABELS[value]}
        </button>
      ))}
    </div>
  )
}
