import { DocumentImageViewer } from './DocumentImageViewer'
import { Modal, ModalCancelOnly } from '../ui/Modal'
import type { DocumentListItem } from '../../db/repositories/model'
import { isDocumentImage, isDocumentPdf } from '../../lib/document-upload'

type DocumentViewerModalProps = {
  document: DocumentListItem | null
  open: boolean
  onClose: () => void
  previewUrl: string | null
  loading: boolean
  error: string | null
}

const viewerPanelClassName =
  'flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl'

export function DocumentViewerModal({
  document: doc,
  open,
  onClose,
  previewUrl,
  loading,
  error,
}: DocumentViewerModalProps) {
  const title = doc?.title ?? 'Document'

  return (
    <Modal
      title={title}
      open={open}
      onClose={onClose}
      panelClassName={viewerPanelClassName}
    >
      <div className="flex min-h-0 flex-col">
        {loading ? (
          <p className="py-12 text-center text-sm text-slate-400">Loading preview…</p>
        ) : null}
        {error ? (
          <p className="py-8 text-center text-sm text-red-400">{error}</p>
        ) : null}
        {!loading && !error && previewUrl && doc ? (
          isDocumentPdf(doc.mimeType, doc.fileName) ? (
            <div className="flex min-h-[70vh] flex-col gap-2">
              <embed
                src={previewUrl}
                type="application/pdf"
                title={doc.title}
                className="min-h-[65vh] w-full flex-1 rounded-lg border border-slate-800 bg-white"
              />
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-center text-sm text-slate-400 underline hover:text-slate-200"
              >
                Open PDF in new tab
              </a>
            </div>
          ) : isDocumentImage(doc.mimeType, doc.fileName) ? (
            <DocumentImageViewer key={previewUrl} src={previewUrl} alt={doc.title} />
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              Preview not available.
            </p>
          )
        ) : null}
        <div className="mt-4 shrink-0">
          <ModalCancelOnly onCancel={onClose} />
        </div>
      </div>
    </Modal>
  )
}
