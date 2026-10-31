const IDB_NAME = 'personal-finance'
const IDB_VERSION = 1
const STORE_NAME = 'database'
const SNAPSHOT_KEY = 'sqlite'

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
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
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
