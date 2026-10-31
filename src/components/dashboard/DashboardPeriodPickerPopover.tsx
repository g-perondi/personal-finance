import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { TZDateMini } from '@date-fns/tz'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'
import './dashboard-day-picker.css'
import type { DashboardPeriod, DashboardScope } from '../../lib/dashboard-period'
import {
  getDashboardPeriodPickerBounds,
  periodForScope,
  yearFromPeriod,
} from '../../lib/dashboard-period'
import { DISPLAY_TIME_ZONE } from '../../lib/datetime'

const PANEL_CLASS =
  'rounded-2xl border border-slate-600/50 bg-slate-900/95 p-4 shadow-2xl shadow-black/50 ring-1 ring-white/10 backdrop-blur-sm'

const PICKER_OPTION_SELECTED =
  'bg-slate-100 text-slate-900 shadow-sm ring-1 ring-slate-200/80'
const PICKER_OPTION =
  'text-slate-300 hover:bg-slate-800/90 hover:text-white active:scale-[0.98]'

type DashboardPeriodPickerPopoverProps = {
  open: boolean
  scope: DashboardScope
  period: DashboardPeriod
  earliestYear: number
  onClose: () => void
  onSelect: (period: DashboardPeriod) => void
  /** Clicks inside this element (e.g. trigger + panel) do not count as outside. */
  containerRef: RefObject<HTMLDivElement | null>
}

function calendarDateToDate(calendarDate: string): Date {
  const [y, m, d] = calendarDate.split('-').map(Number)
  return new TZDateMini(y!, m! - 1, d!, DISPLAY_TIME_ZONE)
}

function dateToCalendarDate(date: Date): string {
  const inRome = new TZDateMini(date, DISPLAY_TIME_ZONE)
  return format(inRome, 'yyyy-MM-dd')
}

function yearMonthFromParts(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

export function DashboardPeriodPickerPopover({
  open,
  scope,
  period,
  earliestYear,
  onClose,
  onSelect,
  containerRef,
}: DashboardPeriodPickerPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const bounds = useMemo(
    () => getDashboardPeriodPickerBounds(earliestYear),
    [earliestYear],
  )
  const aligned = periodForScope(scope, period)

  useEffect(() => {
    if (!open) {
      return
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (containerRef.current?.contains(target)) {
        return
      }
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, onClose, containerRef])

  if (!open) {
    return null
  }

  return (
    <div
      ref={panelRef}
      className={`absolute top-full left-1/2 z-50 mt-3 -translate-x-1/2 ${PANEL_CLASS}`}
      role="dialog"
      aria-label={`Select ${scope}`}
    >
      {scope === 'year' ? (
        <YearPickerGrid
          bounds={bounds}
          selectedYear={yearFromPeriod(period)}
          onSelect={(year) => onSelect({ scope: 'year', year })}
        />
      ) : null}

      {scope === 'month' && aligned.scope === 'month' ? (
        <MonthPickerGrid
          key={aligned.yearMonth}
          bounds={bounds}
          selectedYearMonth={aligned.yearMonth}
          onSelect={(yearMonth) => onSelect({ scope: 'month', yearMonth })}
        />
      ) : null}

      {scope === 'day' && aligned.scope === 'day' ? (
        <div className="dashboard-day-picker">
          <DayPicker
            mode="single"
            timeZone={DISPLAY_TIME_ZONE}
            required
            defaultMonth={calendarDateToDate(aligned.calendarDate)}
            selected={calendarDateToDate(aligned.calendarDate)}
            disabled={[
              { before: calendarDateToDate(bounds.minCalendarDate) },
              { after: calendarDateToDate(bounds.maxCalendarDate) },
            ]}
            onSelect={(date) => {
              if (!date) {
                return
              }
              onSelect({ scope: 'day', calendarDate: dateToCalendarDate(date) })
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

type Bounds = ReturnType<typeof getDashboardPeriodPickerBounds>

function YearPickerGrid({
  bounds,
  selectedYear,
  onSelect,
}: {
  bounds: Bounds
  selectedYear: number
  onSelect: (year: number) => void
}) {
  const years = useMemo(() => {
    const list: number[] = []
    for (let y = bounds.maxYear; y >= bounds.minYear; y -= 1) {
      list.push(y)
    }
    return list
  }, [bounds.maxYear, bounds.minYear])

  return (
    <div className="grid max-h-64 w-56 grid-cols-3 gap-1.5 overflow-y-auto p-0.5">
      {years.map((year) => (
        <button
          key={year}
          type="button"
          className={`rounded-xl px-2 py-2.5 text-sm font-medium transition-all ${
            year === selectedYear ? PICKER_OPTION_SELECTED : PICKER_OPTION
          }`}
          onClick={() => onSelect(year)}
        >
          {year}
        </button>
      ))}
    </div>
  )
}

function MonthPickerGrid({
  bounds,
  selectedYearMonth,
  onSelect,
}: {
  bounds: Bounds
  selectedYearMonth: string
  onSelect: (yearMonth: string) => void
}) {
  const [viewYear, setViewYear] = useState(() => Number(selectedYearMonth.slice(0, 4)))

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
          onClick={() => setViewYear((y) => y - 1)}
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
          onClick={() => setViewYear((y) => y + 1)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 12 }, (_, monthIndex) => {
          const ym = yearMonthFromParts(viewYear, monthIndex)
          const disabled = ym < bounds.minYearMonth || ym > bounds.maxYearMonth
          const selected = ym === selectedYearMonth
          const label = format(new Date(viewYear, monthIndex, 1), 'MMM')
          return (
            <button
              key={ym}
              type="button"
              disabled={disabled}
              className={`rounded-xl px-2 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-30 ${
                selected ? PICKER_OPTION_SELECTED : PICKER_OPTION
              }`}
              onClick={() => onSelect(ym)}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
