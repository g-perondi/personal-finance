const IDB_NAME = 'personal-finance'
export const IDB_VERSION = 2
const STORE_NAME = 'database'
const SNAPSHOT_KEY = 'sqlite'
export const DOCUMENT_BLOB_STORE = 'document_blob'

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION)
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('IndexedDB open failed'))
    })
    request.addEventListener('success', () => {
      resolve(request.result)
    })
    request.addEventListener('upgradeneeded', () => {
      const idb = request.result
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        idb.createObjectStore(STORE_NAME)
      }
      if (!idb.objectStoreNames.contains(DOCUMENT_BLOB_STORE)) {
        idb.createObjectStore(DOCUMENT_BLOB_STORE)
      }
    })
  })
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('IndexedDB request failed'))
    })
    request.addEventListener('success', () => {
      resolve(request.result)
    })
  })
}

function idbTransactionComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.addEventListener('complete', () => resolve())
    tx.addEventListener('error', () => {
      reject(tx.error ?? new Error('IndexedDB transaction failed'))
    })
  })
}

export async function loadSnapshot(): Promise<Uint8Array | null> {
  const idb = await openIdb()
  try {
    const tx = idb.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const value = await idbRequest(store.get(SNAPSHOT_KEY))
    if (value instanceof Uint8Array) {
      return value
    }
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value)
    }
    return null
  } finally {
    idb.close()
  }
}

export async function saveSnapshot(data: Uint8Array): Promise<void> {
  const idb = await openIdb()
  try {
    const tx = idb.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(data, SNAPSHOT_KEY)
    await idbTransactionComplete(tx)
  } finally {
    idb.close()
  }
}

/** Immediate persist of the SQLite snapshot (same as saveSnapshot). */
export async function replaceSnapshot(data: Uint8Array): Promise<void> {
  await saveSnapshot(data)
}

export async function listDocumentBlobKeys(): Promise<string[]> {
  const idb = await openIdb()
  try {
    const tx = idb.transaction(DOCUMENT_BLOB_STORE, 'readonly')
    const store = tx.objectStore(DOCUMENT_BLOB_STORE)
    const keys = await idbRequest(store.getAllKeys())
    await idbTransactionComplete(tx)
    return keys.filter((key): key is string => typeof key === 'string')
  } finally {
    idb.close()
  }
}

export async function clearDocumentBlobStore(): Promise<void> {
  const idb = await openIdb()
  try {
    const tx = idb.transaction(DOCUMENT_BLOB_STORE, 'readwrite')
    const store = tx.objectStore(DOCUMENT_BLOB_STORE)
    store.clear()
    await idbTransactionComplete(tx)
  } finally {
    idb.close()
  }
}

export async function deleteSnapshot(): Promise<void> {
  const idb = await openIdb()
  try {
    const tx = idb.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(SNAPSHOT_KEY)
    await idbTransactionComplete(tx)
  } finally {
    idb.close()
  }
}

export { openIdb, idbRequest, idbTransactionComplete }
