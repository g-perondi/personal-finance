import { useCallback, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DashboardPeriod, DashboardScope } from '../../lib/dashboard-period'
import {
  canShiftDashboardPeriod,
  clampPeriodForDashboard,
  formatDashboardPeriodLabel,
  shiftDashboardPeriod,
} from '../../lib/dashboard-period'
import { DashboardPeriodPickerPopover } from './DashboardPeriodPickerPopover'

const NAV_CHEVRON_CLASS =
  'inline-flex shrink-0 items-center justify-center border-0 bg-transparent p-0 text-slate-400 transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-25'

type DashboardPeriodNavigatorProps = {
  scope: DashboardScope
  period: DashboardPeriod
  earliestYear: number
  onPeriodChange: (period: DashboardPeriod) => void
}

export function DashboardPeriodNavigator({
  scope,
  period,
  earliestYear,
  onPeriodChange,
}: DashboardPeriodNavigatorProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const label = formatDashboardPeriodLabel(period, scope, earliestYear)
  const canPrev = canShiftDashboardPeriod(period, scope, -1, earliestYear)
  const canNext = canShiftDashboardPeriod(period, scope, 1, earliestYear)

  const closePicker = useCallback(() => setPickerOpen(false), [])

  function apply(next: DashboardPeriod) {
    onPeriodChange(clampPeriodForDashboard(next, earliestYear))
    setPickerOpen(false)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Previous period"
        disabled={!canPrev}
        className={NAV_CHEVRON_CLASS}
        onClick={() =>
          onPeriodChange(shiftDashboardPeriod(period, scope, -1, earliestYear))
        }
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>

      <div ref={containerRef} className="relative">
        <button
          type="button"
          className={`min-w-44 rounded-xl border px-4 py-2 text-center text-sm font-semibold transition-all ${
            pickerOpen
              ? 'border-slate-500 bg-slate-700 text-white ring-2 ring-slate-500/40'
              : 'border-slate-700/80 bg-slate-800/90 text-slate-100 hover:border-slate-600 hover:bg-slate-800'
          }`}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          aria-label={`Select ${scope}`}
          onClick={() => setPickerOpen((open) => !open)}
        >
          {label}
        </button>

        <DashboardPeriodPickerPopover
          open={pickerOpen}
          scope={scope}
          period={period}
          earliestYear={earliestYear}
          containerRef={containerRef}
          onClose={closePicker}
          onSelect={apply}
        />
      </div>

      <button
        type="button"
        aria-label="Next period"
        disabled={!canNext}
        className={NAV_CHEVRON_CLASS}
        onClick={() =>
          onPeriodChange(shiftDashboardPeriod(period, scope, 1, earliestYear))
        }
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  )
}
