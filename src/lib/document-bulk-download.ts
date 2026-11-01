import { zipSync } from 'fflate'
import type { DocumentListItem } from '../db/repositories/model'

function padUtc(n: number): string {
  return String(n).padStart(2, '0')
}

function zipDownloadFileName(count: number): string {
  const now = new Date()
  const stamp = `${now.getUTCFullYear()}${padUtc(now.getUTCMonth() + 1)}${padUtc(now.getUTCDate())}-${padUtc(now.getUTCHours())}${padUtc(now.getUTCMinutes())}`
  return `documents-${count}-${stamp}.zip`
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function sanitizeZipEntryName(fileName: string): string {
  const trimmed = fileName.trim() || 'document'
  return trimmed.replace(/[/\\]/g, '_').replace(/\0/g, '')
}

function uniqueZipEntryName(baseName: string, used: Map<string, number>): string {
  const count = used.get(baseName) ?? 0
  used.set(baseName, count + 1)
  if (count === 0) {
    return baseName
  }
  const lastDot = baseName.lastIndexOf('.')
  if (lastDot <= 0) {
    return `${baseName} (${count})`
  }
  const stem = baseName.slice(0, lastDot)
  const ext = baseName.slice(lastDot)
  return `${stem} (${count})${ext}`
}

export async function downloadDocumentListAsZip(
  documents: DocumentListItem[],
  readBlob: (documentId: string) => Promise<ArrayBuffer | null>,
): Promise<void> {
  if (documents.length === 0) {
    throw new Error('No documents selected.')
  }

  const zipEntries: Record<string, Uint8Array> = {}
  const usedNames = new Map<string, number>()
  let missing = 0

  const payloads = await Promise.all(
    documents.map(async (doc) => ({
      doc,
      fileData: await readBlob(doc.id),
    })),
  )

  for (const { doc, fileData } of payloads) {
    if (!fileData) {
      missing += 1
      continue
    }
    const baseName = sanitizeZipEntryName(doc.fileName || doc.title)
    const entryName = uniqueZipEntryName(baseName, usedNames)
    zipEntries[entryName] = new Uint8Array(fileData)
  }

  const included = Object.keys(zipEntries).length
  if (included === 0) {
    throw new Error('No files could be read from local storage.')
  }

  const zipped = zipSync(zipEntries)
  triggerBlobDownload(
    new Blob([zipped], { type: 'application/zip' }),
    zipDownloadFileName(included),
  )

  if (missing > 0) {
    window.alert(
      `${missing} file${missing === 1 ? '' : 's'} could not be read and ${missing === 1 ? 'was' : 'were'} skipped.`,
    )
  }
}
