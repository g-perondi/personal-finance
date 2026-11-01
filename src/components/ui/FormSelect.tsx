import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FORM_PICKER_OPTION,
  FORM_PICKER_OPTION_SELECTED,
  FORM_PICKER_PANEL_CLASS,
} from './formPickerUi'

const PICKER_LAYER_Z = 100
const VIEWPORT_MARGIN = 8

export type FormSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type FormSelectProps = {
  value: string
  onChange: (value: string) => void
  options: FormSelectOption[]
  disabled?: boolean
  placeholder?: string
  id?: string
  className?: string
  'aria-label'?: string
}

type PanelPosition = {
  top: number
  left: number
  width: number
}

function computePanelPosition(anchor: HTMLElement): PanelPosition {
  const rect = anchor.getBoundingClientRect()
  const width = rect.width
  let top = rect.bottom + VIEWPORT_MARGIN
  let left = rect.left
  left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN),
  )
  const maxTop = window.innerHeight - VIEWPORT_MARGIN - 240
  top = Math.min(top, maxTop)
  return { top, left, width }
}

export function FormSelect({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = 'Select…',
  id: idProp,
  className = '',
  'aria-label': ariaLabel,
}: FormSelectProps) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  const listId = `${id}-listbox`
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<PanelPosition>({ top: 0, left: 0, width: 0 })

  const selected = options.find((option) => option.value === value)

  function updatePosition() {
    const anchor = triggerRef.current
    if (!anchor) {
      return
    }
    setPosition(computePanelPosition(anchor))
  }

  useLayoutEffect(() => {
    if (!open) {
      return
    }
    updatePosition()
  }, [open, value])

  useEffect(() => {
    if (!open) {
      return
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }
    function handleReposition() {
      updatePosition()
    }
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [open])

  const panel =
    open && !disabled
      ? createPortal(
          <div
            ref={panelRef}
            id={listId}
            role="listbox"
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              width: position.width,
              zIndex: PICKER_LAYER_Z,
            }}
            className={`max-h-60 overflow-y-auto ${FORM_PICKER_PANEL_CLASS}`}
          >
            {options.map((option) => {
              const isSelected = option.value === value
              return (
                <button
                  key={option.value === '' ? '__empty__' : option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  className={`mb-0.5 w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition-all last:mb-0 disabled:cursor-not-allowed disabled:opacity-40 ${
                    isSelected ? FORM_PICKER_OPTION_SELECTED : FORM_PICKER_OPTION
                  }`}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  {option.label}
                </button>
              )
            })}
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={rootRef} className={className}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className="form-select text-left disabled:opacity-50"
        onClick={() => setOpen((current) => !current)}
      >
        {selected?.label ?? placeholder}
      </button>
      {panel}
    </div>
  )
}
