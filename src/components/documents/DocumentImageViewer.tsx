import { useCallback, useRef, useState } from 'react'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'

const MIN_SCALE = 0.5
const MAX_SCALE = 5
const ZOOM_STEP = 0.25

type DocumentImageViewerProps = {
  src: string
  alt: string
}

type PanOrigin = {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

export function DocumentImageViewer({ src, alt }: DocumentImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<PanOrigin | null>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)

  const resetView = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  function zoomBy(delta: number) {
    setScale((current) => clampScale(current + delta))
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    const direction = event.deltaY < 0 ? 1 : -1
    setScale((current) => clampScale(current + direction * ZOOM_STEP))
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    }
    setIsPanning(true)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) {
      return
    }
    setOffset({
      x: pan.originX + event.clientX - pan.startX,
      y: pan.originY + event.clientY - pan.startY,
    })
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) {
      return
    }
    panRef.current = null
    setIsPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col gap-2">
      <div className="flex justify-end gap-1">
        <button
          type="button"
          className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
          aria-label="Zoom out"
          onClick={() => zoomBy(-ZOOM_STEP)}
        >
          <ZoomOut className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
          aria-label="Zoom in"
          onClick={() => zoomBy(ZOOM_STEP)}
        >
          <ZoomIn className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
          aria-label="Reset zoom and pan"
          onClick={resetView}
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
      </div>

      <div
        ref={containerRef}
        className={`relative max-h-[72vh] min-h-[50vh] flex-1 touch-none overflow-hidden rounded-lg border border-slate-800 bg-slate-950/50 ${
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="flex size-full items-center justify-center">
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="max-h-full max-w-full select-none"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: 'center center',
            }}
          />
        </div>
      </div>
      <p className="text-center text-xs text-slate-500">
        Scroll to zoom · drag to pan · {Math.round(scale * 100)}%
      </p>
    </div>
  )
}
