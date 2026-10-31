export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

function mimeTypeFromFileName(fileName: string): string | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.pdf')) {
    return 'application/pdf'
  }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (lower.endsWith('.png')) {
    return 'image/png'
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp'
  }
  return null
}

function splitFileName(originalFileName: string): {
  baseName: string
  extension: string
} {
  const trimmed = originalFileName.trim()
  const lastDot = trimmed.lastIndexOf('.')
  if (lastDot <= 0) {
    return { baseName: trimmed, extension: '' }
  }
  return {
    baseName: trimmed.slice(0, lastDot),
    extension: trimmed.slice(lastDot),
  }
}

function sanitizeStoredFileBaseName(baseName: string): string {
  const sanitized = baseName
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180)
  return sanitized.length > 0 ? sanitized : 'document'
}

/** UTC compact timestamp for stored file names: `yyyyMMdd_HHmmss`. */
function formatStoredFileTimestamp(createdAt: Date): string {
  const iso = createdAt.toISOString()
  const datePart = iso.slice(0, 10).replace(/-/g, '')
  const timePart = iso.slice(11, 19).replace(/:/g, '')
  return `${datePart}_${timePart}`
}

/** Persisted `document.file_name`: `{sanitized_base}_{yyyyMMdd_HHmmss}{ext}`. */
export function buildStoredDocumentFileName(
  originalFileName: string,
  createdAtUtcIso: string,
): string {
  const { baseName, extension } = splitFileName(originalFileName)
  const safeBase = sanitizeStoredFileBaseName(baseName)
  const timestamp = formatStoredFileTimestamp(new Date(createdAtUtcIso))
  return `${safeBase}_${timestamp}${extension.toLowerCase()}`
}

export function isAllowedDocumentMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.has(mimeType)
}

export function resolveDocumentMimeType(mimeType: string, fileName: string): string {
  if (isAllowedDocumentMimeType(mimeType)) {
    return mimeType
  }
  return mimeTypeFromFileName(fileName) ?? mimeType
}

export function isDocumentPdf(mimeType: string, fileName = ''): boolean {
  return resolveDocumentMimeType(mimeType, fileName) === 'application/pdf'
}

export function isDocumentImage(mimeType: string, fileName = ''): boolean {
  const resolved = resolveDocumentMimeType(mimeType, fileName)
  return (
    resolved === 'image/jpeg' || resolved === 'image/png' || resolved === 'image/webp'
  )
}

export function documentMediaTypeLabel(
  mimeType: string,
  fileName: string,
): 'PDF' | 'Image' {
  if (isDocumentPdf(mimeType, fileName)) {
    return 'PDF'
  }
  return 'Image'
}

export function validateDocumentFile(file: File): string | null {
  const mimeType = resolveDocumentMimeType(file.type, file.name)
  if (!isAllowedDocumentMimeType(mimeType)) {
    return 'Only PDF, JPEG, PNG, and WebP files are allowed.'
  }
  if (file.size <= 0) {
    return 'File is empty.'
  }
  if (file.size > DOCUMENT_MAX_BYTES) {
    return 'File exceeds the 15 MB limit.'
  }
  return null
}

export const DOCUMENT_FILE_ACCEPT =
  'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp'
