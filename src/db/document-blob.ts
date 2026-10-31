import { DOCUMENT_BLOB_STORE, idbRequest, idbTransactionComplete, openIdb } from './idb'

export async function putDocumentBlob(
  documentId: string,
  data: ArrayBuffer,
): Promise<void> {
  const idb = await openIdb()
  try {
    const tx = idb.transaction(DOCUMENT_BLOB_STORE, 'readwrite')
    const store = tx.objectStore(DOCUMENT_BLOB_STORE)
    store.put(data, documentId)
    await idbTransactionComplete(tx)
  } finally {
    idb.close()
  }
}

export async function getDocumentBlob(documentId: string): Promise<ArrayBuffer | null> {
  const idb = await openIdb()
  try {
    const tx = idb.transaction(DOCUMENT_BLOB_STORE, 'readonly')
    const store = tx.objectStore(DOCUMENT_BLOB_STORE)
    const value = await idbRequest(store.get(documentId))
    if (value instanceof ArrayBuffer) {
      return value
    }
    if (value instanceof Uint8Array) {
      const copy = new Uint8Array(value.byteLength)
      copy.set(value)
      return copy.buffer
    }
    return null
  } finally {
    idb.close()
  }
}

export async function deleteDocumentBlob(documentId: string): Promise<void> {
  const idb = await openIdb()
  try {
    const tx = idb.transaction(DOCUMENT_BLOB_STORE, 'readwrite')
    const store = tx.objectStore(DOCUMENT_BLOB_STORE)
    store.delete(documentId)
    await idbTransactionComplete(tx)
  } finally {
    idb.close()
  }
}
