import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { APP_SCROLLBAR_CLASS } from '../../lib/scroll-ui'

type ModalProps = {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
  panelClassName?: string
  layerClassName?: string
}

type ModalActionsProps = {
  onCancel: () => void
  submitLabel?: string
  cancelLabel?: string
  submitDisabled?: boolean
  submitType?: 'submit' | 'button'
  onSubmit?: () => void
  submitClassName?: string
}

const cancelButtonClass =
  'rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50'

const saveButtonClass =
  'rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-white disabled:opacity-50'

export function ModalActions({
  onCancel,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  submitDisabled = false,
  submitType = 'submit',
  onSubmit,
  submitClassName = saveButtonClass,
}: ModalActionsProps) {
  return (
    <div className="flex justify-center gap-2">
      <button type="button" className={cancelButtonClass} onClick={onCancel}>
        {cancelLabel}
      </button>
      <button
        type={submitType}
        className={submitClassName}
        disabled={submitDisabled}
        onClick={submitType === 'button' ? onSubmit : undefined}
      >
        {submitLabel}
      </button>
    </div>
  )
}

export function ModalCancelOnly({
  onCancel,
  cancelLabel = 'Cancel',
}: {
  onCancel: () => void
  cancelLabel?: string
}) {
  return (
    <div className="flex justify-center">
      <button type="button" className={cancelButtonClass} onClick={onCancel}>
        {cancelLabel}
      </button>
    </div>
  )
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
    >
      <div
        className={
          panelClassName ??
          [
            'max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl',
            APP_SCROLLBAR_CLASS,
          ].join(' ')
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
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
