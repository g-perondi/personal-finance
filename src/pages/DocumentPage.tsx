import { useCallback, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { DocumentTagPicker } from '../components/documents/DocumentTagPicker'
import { DocumentViewerModal } from '../components/documents/DocumentViewerModal'
import { Modal } from '../components/ui/Modal'
import { RomeCalendarDateInput } from '../components/ui/RomeCalendarDateInput'
import type { DocumentListItem } from '../db/repositories/model'
import { listDocumentCategories } from '../db/repositories/document_category'
import {
  createDocument,
  deleteDocument,
  listDocumentYears,
  listDocuments,
  readDocumentBlob,
  updateDocument,
} from '../db/repositories/document'
import { useDatabase } from '../hooks/useDatabase'
import {
  currentRomeYear,
  formatItalianCalendarDateInRome,
  utcIsoToRomeDateInputValue,
} from '../lib/datetime'
import {
  DOCUMENT_FILE_ACCEPT,
  resolveDocumentMimeType,
  validateDocumentFile,
  documentMediaTypeLabel,
} from '../lib/document-upload'
import {
  defaultSortDirectionForColumn,
  sortDocumentListItems,
  type DocumentSortColumn,
  type SortDirection,
} from '../lib/document-list-sort'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function defaultTitleFromFileName(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot <= 0) {
    return fileName
  }
  return fileName.slice(0, lastDot)
}

type DocumentFormState = {
  title: string
  referenceYear: string
  documentTagNames: string[]
  documentDate: string
  note: string
  file: File | null
}

const emptyDocumentForm = (): DocumentFormState => ({
  title: '',
  referenceYear: String(currentRomeYear()),
  documentTagNames: [],
  documentDate: '',
  note: '',
  file: null,
})

function formatDocumentTagLabels(tags: DocumentListItem['tags']): string {
  if (tags.length === 0) {
    return '—'
  }
  return tags.map((tag) => tag.name).join(', ')
}

function pillClass(active: boolean): string {
  return `rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
    active
      ? 'bg-slate-100 text-slate-900 shadow-sm'
      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
  }`
}

type DocumentSortState = {
  column: DocumentSortColumn
  direction: SortDirection
}

function DocumentSortHeader({
  column,
  label,
  sort,
  onSort,
}: {
  column: DocumentSortColumn
  label: string
  sort: DocumentSortState
  onSort: (column: DocumentSortColumn) => void
}) {
  const active = sort.column === column
  const SortIcon = active
    ? sort.direction === 'asc'
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown
  return (
    <th
      aria-sort={
        active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <button
        type="button"
        className="inline-flex w-full cursor-pointer items-center justify-center gap-1 hover:text-slate-200"
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        <SortIcon
          className={`size-3.5 shrink-0 ${active ? '' : 'opacity-40'}`}
          aria-hidden
        />
      </button>
    </th>
  )
}

export function DocumentPage() {
  const db = useDatabase()
  const [refreshKey, setRefreshKey] = useState(0)
  const [yearFilter, setYearFilter] = useState<number | 'all'>(() => currentRomeYear())
  const [tagFilter, setTagFilter] = useState<string | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [documentSort, setDocumentSort] = useState<DocumentSortState>({
    column: 'date',
    direction: 'desc',
  })

  const [documentModalOpen, setDocumentModalOpen] = useState(false)
  const [editingDocument, setEditingDocument] = useState<DocumentListItem | null>(null)
  const [documentForm, setDocumentForm] = useState<DocumentFormState>(emptyDocumentForm)
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [viewingDocument, setViewingDocument] = useState<DocumentListItem | null>(null)
  const [viewerPreviewUrl, setViewerPreviewUrl] = useState<string | null>(null)
  const [viewerLoading, setViewerLoading] = useState(false)
  const [viewerError, setViewerError] = useState<string | null>(null)

  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])

  const documentTags = useMemo(() => {
    void refreshKey
    return listDocumentCategories(db)
  }, [db, refreshKey])

  const effectiveTagFilter = useMemo((): string | 'all' => {
    if (tagFilter === 'all') {
      return 'all'
    }
    return documentTags.some((tag) => tag.id === tagFilter) ? tagFilter : 'all'
  }, [tagFilter, documentTags])

  const documentYears = useMemo(() => {
    void refreshKey
    return listDocumentYears(db)
  }, [db, refreshKey])

  const filterYears = useMemo(() => {
    const years = new Set(documentYears)
    years.add(currentRomeYear())
    return [...years].toSorted((a, b) => a - b)
  }, [documentYears])

  const effectiveYearFilter = yearFilter

  const documents = useMemo(() => {
    void refreshKey
    return listDocuments(db, {
      referenceYear: effectiveYearFilter === 'all' ? undefined : effectiveYearFilter,
      documentCategoryId: effectiveTagFilter === 'all' ? undefined : effectiveTagFilter,
      searchQuery,
    })
  }, [db, refreshKey, effectiveYearFilter, effectiveTagFilter, searchQuery])

  const sortedDocuments = useMemo(
    () => sortDocumentListItems(documents, documentSort.column, documentSort.direction),
    [documents, documentSort.column, documentSort.direction],
  )

  function handleDocumentSort(column: DocumentSortColumn) {
    setDocumentSort((current) => {
      if (current.column === column) {
        return {
          column,
          direction: current.direction === 'asc' ? 'desc' : 'asc',
        }
      }
      return { column, direction: defaultSortDirectionForColumn(column) }
    })
  }

  function openCreateDocument() {
    setEditingDocument(null)
    setDocumentForm(emptyDocumentForm())
    setDocumentError(null)
    setDocumentModalOpen(true)
  }

  function openEditDocument(doc: DocumentListItem) {
    setEditingDocument(doc)
    setDocumentForm({
      title: doc.title,
      referenceYear: String(doc.referenceYear),
      documentTagNames: doc.tags.map((tag) => tag.name),
      documentDate: doc.documentDate
        ? utcIsoToRomeDateInputValue(doc.documentDate)
        : '',
      note: doc.note ?? '',
      file: null,
    })
    setDocumentError(null)
    setDocumentModalOpen(true)
  }

  async function handleDocumentSubmit(event: React.FormEvent) {
    event.preventDefault()
    const referenceYear = Number(documentForm.referenceYear)
    if (!documentForm.title.trim()) {
      setDocumentError('Title is required.')
      return
    }
    if (!Number.isInteger(referenceYear) || referenceYear < 1900) {
      setDocumentError('Enter a valid reference year.')
      return
    }

    setSaving(true)
    setDocumentError(null)
    try {
      if (editingDocument) {
        updateDocument(db, editingDocument.id, {
          referenceYear,
          title: documentForm.title,
          documentTagNames: documentForm.documentTagNames,
          documentDate: documentForm.documentDate || null,
          note: documentForm.note,
        })
      } else {
        if (!documentForm.file) {
          setDocumentError('Select a file.')
          setSaving(false)
          return
        }
        const fileError = validateDocumentFile(documentForm.file)
        if (fileError) {
          setDocumentError(fileError)
          setSaving(false)
          return
        }
        const fileData = await documentForm.file.arrayBuffer()
        await createDocument(db, {
          referenceYear,
          title: documentForm.title,
          fileName: documentForm.file.name,
          mimeType: resolveDocumentMimeType(
            documentForm.file.type,
            documentForm.file.name,
          ),
          sizeBytes: documentForm.file.size,
          fileData,
          documentTagNames: documentForm.documentTagNames,
          documentDate: documentForm.documentDate || null,
          note: documentForm.note,
        })
      }
      setDocumentModalOpen(false)
      bump()
    } catch (err: unknown) {
      setDocumentError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleViewDocument(doc: DocumentListItem) {
    if (viewerPreviewUrl) {
      URL.revokeObjectURL(viewerPreviewUrl)
      setViewerPreviewUrl(null)
    }
    setViewingDocument(doc)
    setViewerLoading(true)
    setViewerError(null)
    try {
      const fileData = await readDocumentBlob(doc.id)
      if (!fileData) {
        setViewerError('File not found in local storage.')
        return
      }
      const url = URL.createObjectURL(
        new Blob([fileData], {
          type: resolveDocumentMimeType(doc.mimeType, doc.fileName),
        }),
      )
      setViewerPreviewUrl(url)
    } catch (err: unknown) {
      setViewerError(err instanceof Error ? err.message : 'Could not load preview.')
    } finally {
      setViewerLoading(false)
    }
  }

  function closeDocumentViewer() {
    if (viewerPreviewUrl) {
      URL.revokeObjectURL(viewerPreviewUrl)
    }
    setViewingDocument(null)
    setViewerPreviewUrl(null)
    setViewerLoading(false)
    setViewerError(null)
  }

  async function handleDownload(doc: DocumentListItem) {
    try {
      const blob = await readDocumentBlob(doc.id)
      if (!blob) {
        window.alert('File not found in local storage.')
        return
      }
      const url = URL.createObjectURL(
        new Blob([blob], { type: resolveDocumentMimeType(doc.mimeType, doc.fileName) }),
      )
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = doc.fileName
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Download failed.')
    }
  }

  async function handleDeleteDocument(doc: DocumentListItem) {
    if (!window.confirm(`Delete "${doc.title}"?`)) {
      return
    }
    try {
      await deleteDocument(db, doc.id)
      bump()
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  function handleFileChange(file: File | null) {
    if (!file) {
      setDocumentForm((current) => ({ ...current, file: null }))
      return
    }
    const fileError = validateDocumentFile(file)
    if (fileError) {
      setDocumentError(fileError)
      return
    }
    setDocumentError(null)
    setDocumentForm((current) => ({
      ...current,
      file,
      title: current.title.trim() ? current.title : defaultTitleFromFileName(file.name),
    }))
  }

  return (
    <div className="app-page p-8">
      <header className="mb-4 shrink-0 border-b border-slate-800 pb-4">
        <h2 className="text-2xl font-semibold text-white">Documents</h2>
      </header>

      <div className="mb-4 flex shrink-0 items-center gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={pillClass(effectiveYearFilter === 'all')}
              onClick={() => setYearFilter('all')}
            >
              All years
            </button>
            {filterYears.map((year) => (
              <button
                key={year}
                type="button"
                className={pillClass(effectiveYearFilter === year)}
                onClick={() => setYearFilter(year)}
              >
                {year}
              </button>
            ))}
          </div>
          {documentTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={pillClass(effectiveTagFilter === 'all')}
                onClick={() => setTagFilter('all')}
              >
                All tags
              </button>
              {documentTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={pillClass(effectiveTagFilter === tag.id)}
                  onClick={() => setTagFilter(tag.id)}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white"
          onClick={openCreateDocument}
        >
          <Plus className="size-4" aria-hidden />
          Add
        </button>
      </div>

      {documentYears.length > 0 ? (
        <label className="relative mb-4 block shrink-0">
          <span className="sr-only">Search documents</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500"
            aria-hidden
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search title, notes, file name, tags…"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pr-3 pl-10 text-sm text-white placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
            autoComplete="off"
          />
        </label>
      ) : null}

      <div className="app-page-scroll-ceiling">
        {documentYears.length === 0 ? (
          <p className="text-sm text-slate-500">
            No documents yet. Use Add to upload your first document.
          </p>
        ) : sortedDocuments.length === 0 ? (
          <p className="text-sm text-slate-500">
            {searchQuery.trim()
              ? 'No documents match your search.'
              : 'No documents for the selected filters.'}
          </p>
        ) : (
          <div className="data-table-scroll-shell">
            <table className="documents-table data-table text-sm">
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead className="bg-slate-900/80 text-slate-400">
                <tr>
                  <DocumentSortHeader
                    column="title"
                    label="Title"
                    sort={documentSort}
                    onSort={handleDocumentSort}
                  />
                  <DocumentSortHeader
                    column="year"
                    label="Year"
                    sort={documentSort}
                    onSort={handleDocumentSort}
                  />
                  <th>Tag</th>
                  <DocumentSortHeader
                    column="type"
                    label="Type"
                    sort={documentSort}
                    onSort={handleDocumentSort}
                  />
                  <DocumentSortHeader
                    column="size"
                    label="Size"
                    sort={documentSort}
                    onSort={handleDocumentSort}
                  />
                  <DocumentSortHeader
                    column="date"
                    label="Date"
                    sort={documentSort}
                    onSort={handleDocumentSort}
                  />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {sortedDocuments.map((doc) => (
                  <tr key={doc.id} className="text-slate-200">
                    <td className="truncate font-medium text-white">{doc.title}</td>
                    <td>{doc.referenceYear}</td>
                    <td className="truncate text-slate-400">
                      {formatDocumentTagLabels(doc.tags)}
                    </td>
                    <td className="text-slate-400">
                      {documentMediaTypeLabel(doc.mimeType, doc.fileName)}
                    </td>
                    <td>{formatFileSize(doc.sizeBytes)}</td>
                    <td className="text-slate-400">
                      {doc.documentDate
                        ? formatItalianCalendarDateInRome(doc.documentDate)
                        : '—'}
                    </td>
                    <td>
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                          aria-label={`View ${doc.title}`}
                          onClick={() => void handleViewDocument(doc)}
                        >
                          <Eye className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                          aria-label={`Download ${doc.title}`}
                          onClick={() => void handleDownload(doc)}
                        >
                          <Download className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                          aria-label={`Edit ${doc.title}`}
                          onClick={() => openEditDocument(doc)}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-red-300"
                          aria-label={`Delete ${doc.title}`}
                          onClick={() => void handleDeleteDocument(doc)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        title={editingDocument ? 'Edit document' : 'Add document'}
        open={documentModalOpen}
        onClose={() => setDocumentModalOpen(false)}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => void handleDocumentSubmit(e)}
        >
          {!editingDocument ? (
            <label className="flex cursor-pointer flex-col gap-1 text-sm">
              <span className="text-slate-300">File</span>
              <input
                required
                type="file"
                accept={DOCUMENT_FILE_ACCEPT}
                onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                className="cursor-pointer text-sm text-slate-300 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200"
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Title</span>
            <input
              required
              value={documentForm.title}
              onChange={(event) =>
                setDocumentForm({ ...documentForm, title: event.target.value })
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Reference year</span>
            <input
              required
              type="number"
              min={1900}
              max={9999}
              value={documentForm.referenceYear}
              onChange={(event) =>
                setDocumentForm({ ...documentForm, referenceYear: event.target.value })
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
          <DocumentTagPicker
            knownTags={documentTags}
            selectedTagNames={documentForm.documentTagNames}
            onChangeSelectedTagNames={(documentTagNames) =>
              setDocumentForm((current) => ({ ...current, documentTagNames }))
            }
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Document date (optional)</span>
            <RomeCalendarDateInput
              value={documentForm.documentDate}
              onChange={(documentDate) =>
                setDocumentForm({ ...documentForm, documentDate })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Note</span>
            <textarea
              rows={2}
              value={documentForm.note}
              onChange={(event) =>
                setDocumentForm({ ...documentForm, note: event.target.value })
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
          {documentError ? (
            <p className="text-sm text-red-400">{documentError}</p>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-900 hover:bg-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </Modal>

      <DocumentViewerModal
        open={viewingDocument !== null}
        document={viewingDocument}
        previewUrl={viewerPreviewUrl}
        loading={viewerLoading}
        error={viewerError}
        onClose={closeDocumentViewer}
      />
    </div>
  )
}
