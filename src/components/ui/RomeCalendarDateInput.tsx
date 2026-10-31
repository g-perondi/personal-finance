import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TZDateMini } from '@date-fns/tz'
import { format } from 'date-fns'
import { Calendar } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'
import '../dashboard/dashboard-day-picker.css'
import {
  DISPLAY_TIME_ZONE,
  formatRomeCalendarDateInputItalian,
  parseItalianCalendarDateInput,
} from '../../lib/datetime'

const PICKER_LAYER_Z = 100
const PICKER_ESTIMATED_HEIGHT = 360
const VIEWPORT_MARGIN = 8

type RomeCalendarDateInputProps = {
  value: string
  onChange: (calendarDate: string) => void
  id?: string
  placeholder?: string
  className?: string
  inputClassName?: string
}

type PickerPosition = {
  top: number
  left: number
}

function calendarDateToDate(calendarDate: string): Date {
  const [y, m, d] = calendarDate.split('-').map(Number)
  return new TZDateMini(y!, m! - 1, d!, DISPLAY_TIME_ZONE)
}

function dateToCalendarDate(date: Date): string {
  const inRome = new TZDateMini(date, DISPLAY_TIME_ZONE)
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

export function RomeCalendarDateInput({
  value,
  onChange,
  id: idProp,
  placeholder = 'dd/mm/yyyy',
  className = '',
  inputClassName = 'rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white',
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
  const inputValue = focused ? text : formatRomeCalendarDateInputItalian(value)

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
  }, [pickerOpen, value])

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

  const selected = value ? calendarDateToDate(value) : undefined

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
          className="rounded-2xl border border-slate-600/50 bg-slate-900/95 p-3 shadow-2xl ring-1 shadow-black/50 ring-white/10 backdrop-blur-sm"
        >
          <DayPicker
            mode="single"
            className="dashboard-day-picker"
            defaultMonth={selected}
            selected={selected}
            onSelect={handlePickerSelect}
          />
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
          className={`min-w-0 flex-1 ${inputClassName}`}
        />
        <button
          ref={anchorRef}
          type="button"
          aria-label="Open calendar"
          aria-expanded={pickerOpen}
          aria-controls={`${id}-calendar`}
          onClick={() => setPickerOpen((open) => !open)}
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 px-3 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <Calendar className="size-5" aria-hidden />
        </button>
      </div>
      {pickerPortal}
    </div>
  )
}
