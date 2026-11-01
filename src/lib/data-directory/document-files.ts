import type { Database } from 'sql.js'
import { getDocumentBlob } from '../../db/document-blob'
import { listDocumentBlobKeys } from '../../db/idb'
import { getDocumentById, listDocuments } from '../../db/repositories/document'
import {
  dataDirectoryPathExists,
  readDataDirectoryFile,
  removeDataDirectoryPath,
  writeDataDirectoryFile,
} from './storage'
import {
  documentRelativePath,
  type DocumentFileReadResult,
  type DocumentFileStatus,
} from './types'

export function documentFileErrorMessage(
  code: 'missing_file' | 'directory_unavailable',
  expectedRelativePath: string,
): string {
  if (code === 'directory_unavailable') {
    return 'Cannot access data folder. Re-select it in Settings.'
  }
  return `This document's file is not in your data folder. Expected: \`${expectedRelativePath}\`. Restore from backup or copy the file into place.`
}

export async function readDocumentFile(
  db: Database,
  documentId: string,
): Promise<DocumentFileReadResult> {
  const doc = getDocumentById(db, documentId)
  if (!doc) {
    return {
      ok: false,
      code: 'missing_file',
      expectedRelativePath: `documents/${documentId}/`,
      message: 'Document not found.',
    }
  }
  let expectedRelativePath: string
  try {
    expectedRelativePath = documentRelativePath(documentId, doc.fileName)
  } catch {
    return {
      ok: false,
      code: 'missing_file',
      expectedRelativePath: `documents/${documentId}/`,
      message:
        'Document file name is invalid. Re-upload or restore from a trusted backup.',
    }
  }
  const data = await readDataDirectoryFile(expectedRelativePath)
  if (!data) {
    return {
      ok: false,
      code: 'missing_file',
      expectedRelativePath,
      message: documentFileErrorMessage('missing_file', expectedRelativePath),
    }
  }
  return { ok: true, data }
}

export async function writeDocumentFile(
  documentId: string,
  fileName: string,
  fileData: ArrayBuffer,
): Promise<void> {
  const path = documentRelativePath(documentId, fileName)
  await writeDataDirectoryFile(path, fileData)
}

export async function deleteDocumentFile(
  documentId: string,
  _fileName: string,
): Promise<void> {
  await removeDataDirectoryPath(`documents/${documentId}`)
}

export async function listDocumentFileStatuses(
  db: Database,
): Promise<DocumentFileStatus[]> {
  const docs = listDocuments(db, {})
  return Promise.all(
    docs.map(async (doc) => {
      try {
        const expectedRelativePath = documentRelativePath(doc.id, doc.fileName)
        const ok = await dataDirectoryPathExists(expectedRelativePath)
        return { documentId: doc.id, ok, expectedRelativePath }
      } catch {
        return {
          documentId: doc.id,
          ok: false,
          expectedRelativePath: `documents/${doc.id}/`,
        }
      }
    }),
  )
}

export async function migrateLegacyDocumentBlobsToDirectory(
  db: Database,
): Promise<number> {
  const keys = await listDocumentBlobKeys()
  if (keys.length === 0) {
    return 0
  }
  let migrated = 0
  for (const id of keys) {
    const doc = getDocumentById(db, id)
    if (!doc) {
      continue
    }
    const blob = await getDocumentBlob(id)
    if (!blob) {
      continue
    }
    await writeDocumentFile(id, doc.fileName, blob)
    migrated += 1
  }
  return migrated
}
