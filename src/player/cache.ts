import { defineStore } from 'pinia'
import { Album } from '@/shared/api'
import { sleep } from '@/shared/utils'

const CACHE_NAME = 'airdrome-cache-v2'
const META_DB_NAME = 'airdrome-cache-meta'
const META_STORE_NAME = 'entries'
const META_INFO_STORE_NAME = 'meta'
const MAX_CACHE_SIZE_BYTES = 5 * 1024 * 1024 * 1024 // 5 GB

type MetaEntry = {
  url: string
  size: number
  timestamp: number
  order: number
  lastAccess: number
}

type MetaInfo = {
  id: 'meta'
  totalBytes: number
  nextOrder: number
}

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

function openMetaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(META_DB_NAME, 3)

    req.onupgradeneeded = () => {
      const db = req.result

      let store: IDBObjectStore
      if (!db.objectStoreNames.contains(META_STORE_NAME)) {
        store = db.createObjectStore(META_STORE_NAME, { keyPath: 'url' })
        store.createIndex('order', 'order')
        store.createIndex('lastAccess', 'lastAccess')
      } else {
        store = req.transaction!.objectStore(META_STORE_NAME)
        if (!store.indexNames.contains('lastAccess')) {
          store.createIndex('lastAccess', 'lastAccess')
        }
      }

      if (!db.objectStoreNames.contains(META_INFO_STORE_NAME)) {
        db.createObjectStore(META_INFO_STORE_NAME, { keyPath: 'id' })
      }
    }

    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction(META_INFO_STORE_NAME, 'readwrite')
      const store = tx.objectStore(META_INFO_STORE_NAME)

      const getReq = store.get('meta')
      getReq.onsuccess = () => {
        if (!getReq.result) {
          store.put({ id: 'meta', totalBytes: 0, nextOrder: 1 } as MetaInfo)
        }
      }

      tx.oncomplete = () => resolve(db)
      tx.onerror = () => resolve(db)
    }

    req.onerror = () => reject(req.error)
  })
}

async function getMetaInfo(): Promise<MetaInfo> {
  const db = await openMetaDB()
  return new Promise(resolve => {
    const tx = db.transaction(META_INFO_STORE_NAME, 'readonly')
    const store = tx.objectStore(META_INFO_STORE_NAME)
    const req = store.get('meta')

    req.onsuccess = () => {
      resolve(req.result || { id: 'meta', totalBytes: 0, nextOrder: 1 })
    }

    req.onerror = () => {
      resolve({ id: 'meta', totalBytes: 0, nextOrder: 1 })
    }
  })
}

async function touchMeta(url: string) {
  const db = await openMetaDB()
  const tx = db.transaction(META_STORE_NAME, 'readwrite')
  const store = tx.objectStore(META_STORE_NAME)

  const req = store.get(url)
  req.onsuccess = () => {
    const entry = req.result as MetaEntry | undefined
    if (!entry) return
    entry.lastAccess = Date.now()
    store.put(entry)
  }
}

async function putMeta(url: string, size: number) {
  const db = await openMetaDB()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE_NAME, META_INFO_STORE_NAME], 'readwrite')
    const entries = tx.objectStore(META_STORE_NAME)
    const metaStore = tx.objectStore(META_INFO_STORE_NAME)

    const metaReq = metaStore.get('meta')
    metaReq.onsuccess = () => {
      const meta = metaReq.result as MetaInfo
      const now = Date.now()

      const entry: MetaEntry = {
        url,
        size,
        timestamp: now,
        order: meta.nextOrder++,
        lastAccess: now,
      }

      meta.totalBytes += size
      entries.put(entry)
      metaStore.put(meta)
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteMeta(url: string) {
  const db = await openMetaDB()
  const tx = db.transaction([META_STORE_NAME, META_INFO_STORE_NAME], 'readwrite')
  const entries = tx.objectStore(META_STORE_NAME)
  const metaStore = tx.objectStore(META_INFO_STORE_NAME)

  const entryReq = entries.get(url)
  entryReq.onsuccess = () => {
    const entry = entryReq.result as MetaEntry | undefined
    if (!entry) return

    entries.delete(url)

    const metaReq = metaStore.get('meta')
    metaReq.onsuccess = () => {
      const meta = metaReq.result as MetaInfo
      meta.totalBytes = Math.max(0, meta.totalBytes - entry.size)
      metaStore.put(meta)
    }
  }
}

// ---------------------------------------------------------------------------
// LRU eviction
// ---------------------------------------------------------------------------

async function enforceCacheLimitLRU() {
  const cache = await caches.open(CACHE_NAME)
  const meta = await getMetaInfo()
  let total = meta.totalBytes

  if (total <= MAX_CACHE_SIZE_BYTES) return

  const db = await openMetaDB()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE_NAME, META_INFO_STORE_NAME], 'readwrite')
    const store = tx.objectStore(META_STORE_NAME)
    const index = store.index('lastAccess')
    const metaStore = tx.objectStore(META_INFO_STORE_NAME)

    const cursorReq = index.openCursor()

    cursorReq.onsuccess = async() => {
      let cursor = cursorReq.result as IDBCursorWithValue | null

      while (cursor && total > MAX_CACHE_SIZE_BYTES) {
        const entry = cursor.value as MetaEntry

        await cache.delete(entry.url)
        store.delete(entry.url)
        total -= entry.size

        window.dispatchEvent(
          new CustomEvent('audioCacheDeleted', { detail: entry.url }),
        )

        cursor = await new Promise<IDBCursorWithValue | null>(res => {
          cursor!.continue()
          cursor!.request.onsuccess = () =>
            res(cursor!.request.result as IDBCursorWithValue | null)
          cursor!.request.onerror = () => res(null)
        })
      }

      const metaReq = metaStore.get('meta')
      metaReq.onsuccess = () => {
        const m = metaReq.result as MetaInfo
        m.totalBytes = total
        metaStore.put(m)
      }

      tx.oncomplete = () => {
        window.dispatchEvent(
          new CustomEvent('audioCacheEvicted', { detail: { totalBytes: total } }),
        )
        resolve()
      }
    }

    cursorReq.onerror = () => reject(cursorReq.error)
  })
}

// ---------------------------------------------------------------------------
// Store (FIFO queue enabled)
// ---------------------------------------------------------------------------

export const useCacheStore = defineStore('albumCache', {
  state: () => ({
    activeCaching: new Map<string, { cancelled: boolean }>(),

    queue: [] as string[],
    queuedSet: new Set<string>(),
    processingQueue: false,
  }),

  actions: {
    // --------------------------------------------------
    // FIFO worker
    // --------------------------------------------------

    async processQueue() {
      if (this.processingQueue) return
      this.processingQueue = true

      const cache = await caches.open(CACHE_NAME)

      while (this.queue.length > 0) {
        const url = this.queue.shift()!
        this.queuedSet.delete(url)

        try {
          if (await cache.match(url)) {
            await touchMeta(url)
            continue
          }

          const res = await fetch(url, { mode: 'cors', cache: 'force-cache' })
          if (!res.ok) continue

          const clone = res.clone()
          const blob = await res.blob()

          await cache.put(url, clone)
          await putMeta(url, blob.size)
          await enforceCacheLimitLRU()

          window.dispatchEvent(
            new CustomEvent('audioCached', { detail: url }),
          )
        } catch (err) {
          console.error('Cache error:', err)
        }
      }

      this.processingQueue = false
    },

    // --------------------------------------------------
    // Public enqueue method
    // --------------------------------------------------

    async cacheTrack(url: string) {
      if (!url || this.queuedSet.has(url)) return

      this.queue.push(url)
      this.queuedSet.add(url)

      if (!this.processingQueue) {
        this.processQueue()
      }
    },

    async hasTrack(url: string) {
      if (!url) return false
      const cache = await caches.open(CACHE_NAME)
      const match = await cache.match(url)
      if (match) await touchMeta(url)
      return !!match
    },

    async deleteTrack(url: string) {
      if (!url) return
      const cache = await caches.open(CACHE_NAME)
      if (await cache.delete(url)) {
        await deleteMeta(url)
        window.dispatchEvent(
          new CustomEvent('audioCacheDeleted', { detail: url }),
        )
      }
    },

    async clearAllAudioCache() {
      await caches.delete(CACHE_NAME)
      indexedDB.deleteDatabase(META_DB_NAME)
      window.dispatchEvent(new CustomEvent('audioCacheClearedAll'))
      return true
    },

    async cacheAlbum(album: Album) {
      if (!album?.tracks?.length) return

      const key = album.id || album.name
      this.activeCaching.set(key, { cancelled: false })
      const session = this.activeCaching.get(key)!

      const urls = album.tracks.map(t => t.url).filter(Boolean) as string[]

      for (const url of urls) {
        if (session.cancelled) return
        await this.cacheTrack(url)
        await sleep(200)
      }
    },

    async clearAlbumCache(album: Album) {
      if (!album?.tracks?.length) return

      const key = album.id || album.name
      if (key && this.activeCaching.has(key)) {
        this.activeCaching.get(key)!.cancelled = true
        await sleep(1000)
      }

      const cache = await caches.open(CACHE_NAME)

      for (const t of album.tracks) {
        if (!t.url) continue
        if (await cache.delete(t.url)) {
          await deleteMeta(t.url)
          window.dispatchEvent(
            new CustomEvent('audioCacheDeleted', { detail: t.url }),
          )
        }
      }
    },

    async isCached(album: Album) {
      if (!album?.tracks?.length) return false
      const cache = await caches.open(CACHE_NAME)
      const res = await Promise.all(
        album.tracks.map(t => (t.url ? cache.match(t.url) : null)),
      )
      return res.every(Boolean)
    },

    async getCacheSizeGB() {
      const meta = await getMetaInfo()
      return Math.round((meta.totalBytes / 1024 ** 3) * 10) / 10
    },
  },
})
