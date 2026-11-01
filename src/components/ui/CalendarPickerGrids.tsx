import { useMemo } from 'react'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { FORM_PICKER_OPTION, FORM_PICKER_OPTION_SELECTED } from './formPickerUi'
import { APP_SCROLLBAR_CLASS } from '../../lib/scroll-ui'
import { currentRomeYear } from '../../lib/datetime'

export type CalendarPickerBounds = {
  minYear: number
  maxYear: number
}

export function defaultCalendarPickerBounds(): CalendarPickerBounds {
  return { minYear: 1970, maxYear: currentRomeYear() + 1 }
}

export function calendarYearMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

export function CalendarYearGrid({
  bounds,
  selectedYear,
  onSelect,
}: {
  bounds: CalendarPickerBounds
  selectedYear: number
  onSelect: (year: number) => void
}) {
  const years = useMemo(() => {
    const list: number[] = []
    for (let year = bounds.maxYear; year >= bounds.minYear; year -= 1) {
      list.push(year)
    }
    return list
  }, [bounds.maxYear, bounds.minYear])

  return (
    <div
      className={`grid max-h-52 w-56 grid-cols-3 gap-1.5 overflow-y-auto p-0.5 ${APP_SCROLLBAR_CLASS}`}
    >
      {years.map((year) => (
        <button
          key={year}
          type="button"
          className={`rounded-xl px-2 py-2.5 text-sm font-medium transition-all ${
            year === selectedYear ? FORM_PICKER_OPTION_SELECTED : FORM_PICKER_OPTION
          }`}
          onClick={() => onSelect(year)}
        >
          {year}
        </button>
      ))}
    </div>
  )
}

export function CalendarMonthGrid({
  bounds,
  viewYear,
  onViewYearChange,
  selectedYearMonth,
  onSelect,
}: {
  bounds: CalendarPickerBounds
  viewYear: number
  onViewYearChange: (year: number) => void
  selectedYearMonth: string
  onSelect: (yearMonth: string) => void
}) {
  const canPrevYear = viewYear > bounds.minYear
  const canNextYear = viewYear < bounds.maxYear

  return (
    <div className="w-64">
      <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-slate-950/60 px-2 py-1 ring-1 ring-slate-700/50">
        <button
          type="button"
          aria-label="Previous year"
          disabled={!canPrevYear}
          className="flex size-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
          onClick={() => onViewYearChange(viewYear - 1)}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="text-sm font-semibold text-white tabular-nums">
          {viewYear}
        </span>
        <button
          type="button"
          aria-label="Next year"
          disabled={!canNextYear}
          className="flex size-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
          onClick={() => onViewYearChange(viewYear + 1)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 12 }, (_, monthIndex) => {
          const yearMonth = calendarYearMonthKey(viewYear, monthIndex)
          const selected = yearMonth === selectedYearMonth
          const label = format(new Date(viewYear, monthIndex, 1), 'MMM')
          return (
            <button
              key={yearMonth}
              type="button"
              className={`rounded-xl px-2 py-2.5 text-sm font-medium transition-all ${
                selected ? FORM_PICKER_OPTION_SELECTED : FORM_PICKER_OPTION
              }`}
              onClick={() => onSelect(yearMonth)}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
