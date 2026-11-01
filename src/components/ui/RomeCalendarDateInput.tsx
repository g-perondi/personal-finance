import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TZDateMini } from '@date-fns/tz'
import { format } from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'
import '../dashboard/dashboard-day-picker.css'
import {
  CalendarMonthGrid,
  CalendarYearGrid,
  calendarYearMonthKey,
  defaultCalendarPickerBounds,
} from './CalendarPickerGrids'
import { FORM_PICKER_PANEL_CLASS } from './formPickerUi'
import {
  getDisplayTimeZone,
  formatRomeCalendarDateInputItalian,
  parseItalianCalendarDateInput,
  todayRomeDateInputValue,
} from '../../lib/datetime'

const PICKER_LAYER_Z = 100
const PICKER_ESTIMATED_HEIGHT = 360
const VIEWPORT_MARGIN = 8

type PickerPanelMode = 'days' | 'months' | 'years'

type RomeCalendarDateInputProps = {
  value: string
  onChange: (calendarDate: string) => void
  id?: string
  placeholder?: string
  className?: string
  inputClassName?: string
  invalid?: boolean
}

type PickerPosition = {
  top: number
  left: number
}

function calendarDateToDate(calendarDate: string): Date {
  const [y, m, d] = calendarDate.split('-').map(Number)
  return new TZDateMini(y!, m! - 1, d!, getDisplayTimeZone())
}

function dateToCalendarDate(date: Date): string {
  const inRome = new TZDateMini(date, getDisplayTimeZone())
  return format(inRome, 'yyyy-MM-dd')
}

function computePickerPosition(
  anchor: HTMLElement,
  popoverWidth: number,
): PickerPosition {
  const rect = anchor.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN
  const spaceAbove = rect.top - VIEWPORT_MARGIN
  const openAbove =
    spaceBelow < PICKER_ESTIMATED_HEIGHT &&
    spaceAbove >= Math.min(PICKER_ESTIMATED_HEIGHT, spaceBelow)

  let top = openAbove
    ? rect.top - PICKER_ESTIMATED_HEIGHT - VIEWPORT_MARGIN
    : rect.bottom + VIEWPORT_MARGIN

  top = Math.max(
    VIEWPORT_MARGIN,
    Math.min(top, window.innerHeight - PICKER_ESTIMATED_HEIGHT - VIEWPORT_MARGIN),
  )

  let left = rect.left
  left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(left, window.innerWidth - popoverWidth - VIEWPORT_MARGIN),
  )

  return { top, left }
}

function dateToViewMonth(calendarDate: string | undefined): Date {
  if (calendarDate) {
    return calendarDateToDate(calendarDate)
  }
  return calendarDateToDate(todayRomeDateInputValue())
}

export function RomeCalendarDateInput({
  value,
  onChange,
  id: idProp,
  placeholder = 'dd/mm/yyyy',
  className = '',
  inputClassName = 'form-field',
  invalid = false,
}: RomeCalendarDateInputProps) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  const rootRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerPosition, setPickerPosition] = useState<PickerPosition>({
    top: 0,
    left: 0,
  })
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState('')
  const [panelMode, setPanelMode] = useState<PickerPanelMode>('days')
  const [viewMonth, setViewMonth] = useState<Date>(() => dateToViewMonth(value))
  const [viewYear, setViewYear] = useState(() => dateToViewMonth(value).getFullYear())
  const bounds = useMemo(() => defaultCalendarPickerBounds(), [])
  const inputValue = focused ? text : formatRomeCalendarDateInputItalian(value)

  const selectedYearMonth = useMemo(
    () => calendarYearMonthKey(viewMonth.getFullYear(), viewMonth.getMonth()),
    [viewMonth],
  )

  function openPicker() {
    const nextMonth = dateToViewMonth(value)
    setViewMonth(nextMonth)
    setViewYear(nextMonth.getFullYear())
    setPanelMode('days')
    setPickerOpen(true)
  }

  function updatePickerPosition() {
    const anchor = anchorRef.current
    const popover = popoverRef.current
    if (!anchor) {
      return
    }
    const width = popover?.offsetWidth ?? 280
    let next = computePickerPosition(anchor, width)
    if (popover) {
      const rect = anchor.getBoundingClientRect()
      const height = popover.offsetHeight
      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN
      let top = next.top
      if (spaceBelow < height && rect.top > height + VIEWPORT_MARGIN) {
        top = rect.top - height - VIEWPORT_MARGIN
      }
      top = Math.max(
        VIEWPORT_MARGIN,
        Math.min(top, window.innerHeight - height - VIEWPORT_MARGIN),
      )
      next = { top, left: next.left }
    }
    setPickerPosition(next)
  }

  useLayoutEffect(() => {
    if (!pickerOpen) {
      return
    }
    updatePickerPosition()
  }, [pickerOpen, value, panelMode])

  useEffect(() => {
    if (!pickerOpen) {
      return
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return
      }
      setPickerOpen(false)
    }
    function handleReposition() {
      updatePickerPosition()
    }
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [pickerOpen])

  function commitText(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) {
      onChange('')
      setText('')
      return
    }
    const parsed = parseItalianCalendarDateInput(trimmed)
    if (parsed) {
      onChange(parsed)
      setText(formatRomeCalendarDateInputItalian(parsed))
      return
    }
    setText(formatRomeCalendarDateInputItalian(value))
  }

  function handlePickerSelect(date: Date | undefined) {
    if (!date) {
      return
    }
    const next = dateToCalendarDate(date)
    onChange(next)
    setText(formatRomeCalendarDateInputItalian(next))
    setFocused(false)
    setPickerOpen(false)
  }

  function shiftViewMonth(delta: number) {
    setViewMonth((current) => {
      const inRome = new TZDateMini(current, getDisplayTimeZone())
      const next = new TZDateMini(
        inRome.getFullYear(),
        inRome.getMonth() + delta,
        1,
        getDisplayTimeZone(),
      )
      setViewYear(next.getFullYear())
      return next
    })
  }

  function handleYearSelect(year: number) {
    setViewYear(year)
    setViewMonth((current) => {
      const inRome = new TZDateMini(current, getDisplayTimeZone())
      return new TZDateMini(year, inRome.getMonth(), 1, getDisplayTimeZone())
    })
    setPanelMode('months')
  }

  function handleMonthSelect(yearMonth: string) {
    const year = Number(yearMonth.slice(0, 4))
    const monthIndex = Number(yearMonth.slice(5, 7)) - 1
    setViewYear(year)
    setViewMonth(new TZDateMini(year, monthIndex, 1, getDisplayTimeZone()))
    setPanelMode('days')
  }

  const selected = value ? calendarDateToDate(value) : undefined
  const viewMonthRome = new TZDateMini(viewMonth, getDisplayTimeZone())
  const minYearMonth = `${bounds.minYear}-01`
  const maxYearMonth = `${bounds.maxYear}-12`
  const canPrevMonth = selectedYearMonth > minYearMonth
  const canNextMonth = selectedYearMonth < maxYearMonth

  const pickerPortal = pickerOpen
    ? createPortal(
        <div
          ref={popoverRef}
          id={`${id}-calendar`}
          style={{
            position: 'fixed',
            top: pickerPosition.top,
            left: pickerPosition.left,
            zIndex: PICKER_LAYER_Z,
          }}
          className={`p-3 ${FORM_PICKER_PANEL_CLASS}`}
        >
          {panelMode === 'years' ? (
            <CalendarYearGrid
              bounds={bounds}
              selectedYear={viewYear}
              onSelect={handleYearSelect}
            />
          ) : null}

          {panelMode === 'months' ? (
            <CalendarMonthGrid
              bounds={bounds}
              viewYear={viewYear}
              onViewYearChange={setViewYear}
              selectedYearMonth={selectedYearMonth}
              onSelect={handleMonthSelect}
            />
          ) : null}

          {panelMode === 'days' ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  disabled={!canPrevMonth}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
                  onClick={() => shiftViewMonth(-1)}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
                  <button
                    type="button"
                    className="truncate rounded-xl px-2 py-1 text-sm font-semibold text-white hover:bg-slate-800"
                    onClick={() => {
                      setViewYear(viewMonthRome.getFullYear())
                      setPanelMode('months')
                    }}
                  >
                    {format(viewMonthRome, 'MMMM')}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl px-2 py-1 text-sm font-semibold text-white tabular-nums hover:bg-slate-800"
                    onClick={() => {
                      setViewYear(viewMonthRome.getFullYear())
                      setPanelMode('years')
                    }}
                  >
                    {viewMonthRome.getFullYear()}
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="Next month"
                  disabled={!canNextMonth}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
                  onClick={() => shiftViewMonth(1)}
                >
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
              <DayPicker
                mode="single"
                className="dashboard-day-picker dashboard-day-picker--custom-nav"
                month={viewMonth}
                onMonthChange={setViewMonth}
                hideNavigation
                selected={selected}
                onSelect={handlePickerSelect}
              />
            </>
          ) : null}
        </div>,
        document.body,
      )
    : null

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={inputValue}
          onFocus={() => {
            setFocused(true)
            setText(formatRomeCalendarDateInputItalian(value))
          }}
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => {
            commitText(event.target.value)
            setFocused(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitText(text)
              setFocused(false)
            }
          }}
          className={`min-w-0 flex-1 ${inputClassName}${invalid ? 'form-field--invalid' : ''}`}
        />
        <button
          ref={anchorRef}
          type="button"
          aria-label="Open calendar"
          aria-expanded={pickerOpen}
          aria-controls={`${id}-calendar`}
          onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
          className="form-field-icon-button"
        >
          <Calendar className="size-5" aria-hidden />
        </button>
      </div>
      {pickerPortal}
    </div>
  )
}
