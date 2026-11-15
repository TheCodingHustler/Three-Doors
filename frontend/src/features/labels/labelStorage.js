const DATABASE_NAME = 'three-doors-label-reader'
const DATABASE_VERSION = 1
const STORE_NAME = 'saved-labels'

let databasePromise

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('This browser does not support local saved labels.'))
  }

  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Could not open local label storage.'))
      request.onblocked = () => reject(new Error('Local label storage is blocked by another tab.'))
    }).catch((error) => {
      databasePromise = null
      throw error
    })
  }

  return databasePromise
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Local label storage request failed.'))
  })
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Local label storage transaction failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Local label storage transaction was aborted.'))
  })
}

export function createSavedLabelRecord(result, now = new Date()) {
  const id = globalThis.crypto?.randomUUID?.()
    ?? `${now.getTime()}-${Math.random().toString(36).slice(2)}`

  return {
    id,
    sourceKey: `${result.name}:${result.labelNumber ?? 1}:${result.text}`,
    name: result.name,
    labelNumber: result.labelNumber ?? 1,
    text: result.text,
    confidence: Number.isFinite(result.confidence) ? result.confidence : null,
    lowConfidence: Boolean(result.lowConfidence),
    fields: result.parsed ?? null,
    savedAt: now.toISOString(),
  }
}

export async function listSavedLabels() {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readonly')
  const complete = transactionComplete(transaction)
  const records = await requestResult(transaction.objectStore(STORE_NAME).getAll())
  await complete
  return records.sort((left, right) => right.savedAt.localeCompare(left.savedAt))
}

export async function saveLabel(result) {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readwrite')
  const complete = transactionComplete(transaction)
  const store = transaction.objectStore(STORE_NAME)
  const record = createSavedLabelRecord(result)
  const existing = await requestResult(store.getAll())
  const duplicate = existing.find((item) => item.sourceKey === record.sourceKey)

  if (duplicate) {
    record.id = duplicate.id
    record.savedAt = duplicate.savedAt
  }

  await requestResult(store.put(record))
  await complete
  return record
}

export async function deleteSavedLabel(id) {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readwrite')
  const complete = transactionComplete(transaction)
  await requestResult(transaction.objectStore(STORE_NAME).delete(id))
  await complete
}

export async function deleteAllSavedLabels() {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readwrite')
  const complete = transactionComplete(transaction)
  await requestResult(transaction.objectStore(STORE_NAME).clear())
  await complete
}
