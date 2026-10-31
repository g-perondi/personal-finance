import type { ReactNode } from 'react'
import { X } from 'lucide-react'

type ModalProps = {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
  panelClassName?: string
  layerClassName?: string
}

export function Modal({
  title,
  open,
  onClose,
  children,
  panelClassName,
  layerClassName = 'z-50',
}: ModalProps) {
  if (!open) {
    return null
  }

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/60 p-4 ${layerClassName}`}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={
          panelClassName ??
          'max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl'
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 id="modal-title" className="text-lg font-semibold text-white">
            {title}
          </h3>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
