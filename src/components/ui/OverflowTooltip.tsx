import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type OverflowTooltipProps = {
  text: string
  className?: string
  /** Extra lines below the truncated label (same hover zone). */
  children?: ReactNode
}

const TOOLTIP_CURSOR_OFFSET_X = 12
const TOOLTIP_CURSOR_OFFSET_Y = 0

export function OverflowTooltip({ text, className, children }: OverflowTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const hoverRef = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const tooltipId = useId()

  useEffect(() => {
    const el = anchorRef.current
    if (!el) {
      return
    }
    const measure = () => {
      setOverflowing(el.scrollWidth > el.clientWidth)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text])

  useEffect(() => {
    if (!visible) {
      return
    }
    const hide = () => setVisible(false)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [visible])

  function placeAtCursor(clientX: number, clientY: number) {
    setPosition({
      top: clientY + TOOLTIP_CURSOR_OFFSET_Y,
      left: clientX + TOOLTIP_CURSOR_OFFSET_X,
    })
  }

  function handleMouseEnter(event: MouseEvent<HTMLDivElement>) {
    if (!overflowing) {
      return
    }
    placeAtCursor(event.clientX, event.clientY)
    setVisible(true)
  }

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!overflowing || !visible) {
      return
    }
    placeAtCursor(event.clientX, event.clientY)
  }

  function handleMouseLeave() {
    setVisible(false)
  }

  function handleFocus() {
    if (!overflowing) {
      return
    }
    const el = hoverRef.current ?? anchorRef.current
    if (!el) {
      return
    }
    const rect = el.getBoundingClientRect()
    setPosition({
      top: rect.top + rect.height / 2,
      left: rect.right + TOOLTIP_CURSOR_OFFSET_X,
    })
    setVisible(true)
  }

  function handleBlur() {
    setVisible(false)
  }

  return (
    <>
      <div
        ref={hoverRef}
        className="min-w-0"
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <span
          ref={anchorRef}
          className={`block min-w-0 truncate ${className ?? ''}`}
          tabIndex={overflowing ? 0 : undefined}
          aria-describedby={visible ? tooltipId : undefined}
          onFocus={handleFocus}
          onBlur={handleBlur}
        >
          {text}
        </span>
        {children}
      </div>
      {visible && overflowing
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none fixed z-200 max-w-xs -translate-y-1/2 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-left text-xs leading-snug text-slate-100 shadow-lg"
              style={{ top: position.top, left: position.left }}
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
