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
  order: number // append-only counter for eviction (FIFO)
  lastAccess?: number // optional for possible future LRU
}

type MetaInfo = {
  id: 'meta'
  totalBytes: number
  nextOrder: number
}

function openMetaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(META_DB_NAME, 2)

    req.onupgradeneeded = () => {
      const db = req.result
      // Entries store: keyPath url, indexed by order for FIFO eviction
      if (!db.objectStoreNames.contains(META_STORE_NAME)) {
        const store = db.createObjectStore(META_STORE_NAME, { keyPath: 'url' })
        store.createIndex('order', 'order', { unique: false })
      }

      // Meta info store: single record storing totals and counters
      if (!db.objectStoreNames.contains(META_INFO_STORE_NAME)) {
        db.createObjectStore(META_INFO_STORE_NAME, { keyPath: 'id' })
      }
    }

    req.onsuccess = async() => {
      const db = req.result
      // Ensure the meta record exists (id = 'meta')
      try {
        const tx = db.transaction(META_INFO_STORE_NAME, 'readwrite')
        const store = tx.objectStore(META_INFO_STORE_NAME)
        const getReq = store.get('meta')
        getReq.onsuccess = () => {
          if (!getReq.result) {
            store.put({ id: 'meta', totalBytes: 0, nextOrder: 1 } as MetaInfo)
          }
        }
        getReq.onerror = () => {
          store.put({ id: 'meta', totalBytes: 0, nextOrder: 1 } as MetaInfo)
        }
        tx.oncomplete = () => resolve(db)
        tx.onerror = () => reject(tx.error)
      } catch (err) {
        // Fallback: still resolve with db
        resolve(db)
      }
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
    req.onsuccess = () => resolve((req.result as MetaInfo) || { id: 'meta', totalBytes: 0, nextOrder: 1 })
    req.onerror = () => resolve({ id: 'meta', totalBytes: 0, nextOrder: 1 })
  })
}

async function putMeta(url: string, size: number) {
  const db = await openMetaDB()
  // Get metaInfo, then put entry and update totals atomically in a transaction
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE_NAME, META_INFO_STORE_NAME], 'readwrite')
    const entries = tx.objectStore(META_STORE_NAME)
    const metaStore = tx.objectStore(META_INFO_STORE_NAME)

    const metaReq = metaStore.get('meta')
    metaReq.onsuccess = () => {
      const meta = (metaReq.result as MetaInfo) || { id: 'meta', totalBytes: 0, nextOrder: 1 }
      const now = Date.now()
      const entry: MetaEntry = { url, size, timestamp: now, order: meta.nextOrder }
      meta.nextOrder += 1
      meta.totalBytes += size

      entries.put(entry)
      metaStore.put(meta)
    }

    metaReq.onerror = () => {
      // Best effort: put entry with order = Date.now()
      const now = Date.now()
      const entry: MetaEntry = { url, size, timestamp: now, order: now }
      entries.put(entry)

      // Update meta store separately
      const upd: MetaInfo = { id: 'meta', totalBytes: size, nextOrder: now + 1 }
      metaStore.put(upd)
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteMeta(url: string) {
  const db = await openMetaDB()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE_NAME, META_INFO_STORE_NAME], 'readwrite')
    const entries = tx.objectStore(META_STORE_NAME)
    const metaStore = tx.objectStore(META_INFO_STORE_NAME)

    const getReq = entries.get(url)
    getReq.onsuccess = () => {
      const entry = getReq.result as MetaEntry | undefined
      if (entry) {
        entries.delete(url)
        const metaReq = metaStore.get('meta')
        metaReq.onsuccess = () => {
          const meta = (metaReq.result as MetaInfo) || { id: 'meta', totalBytes: 0, nextOrder: 1 }
          meta.totalBytes = Math.max(0, meta.totalBytes - entry.size)
          metaStore.put(meta)
        }
      }
    }

    getReq.onerror = () => {
      // nothing to do
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function enforceCacheLimitFIFO() {
  const cache = await caches.open(CACHE_NAME)
  const meta = await getMetaInfo()
  let total = meta.totalBytes

  if (total <= MAX_CACHE_SIZE_BYTES) return

  console.info('[Cache] Exceeds limit — pruning oldest entries...')

  const db = await openMetaDB()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE_NAME, META_INFO_STORE_NAME], 'readwrite')
    const entries = tx.objectStore(META_STORE_NAME)
    const orderIndex = entries.index('order')
    const metaStore = tx.objectStore(META_INFO_STORE_NAME)

    // Open cursor on order index ascending (oldest first)
    const cursorReq = orderIndex.openCursor()
    cursorReq.onsuccess = () => {
      const startCursor = cursorReq.result as IDBCursorWithValue | null

      // Process the cursor sequentially. We use recursion to ensure each async
      // eviction finishes before advancing the cursor, avoiding concurrency and
      // keeping the IDB cursor flow correct.
      const processCursor = (cur: IDBCursorWithValue | null): Promise<void> => {
        return new Promise(resolve => {
          if (!cur || total <= MAX_CACHE_SIZE_BYTES) {
            resolve()
            return
          }

          const entry = cur.value as MetaEntry

          ;(async() => {
            try {
              await cache.delete(entry.url)
              entries.delete(entry.url)
              total -= entry.size
              console.info(`[Cache] Evicted ${entry.url} (${(entry.size / 1_048_576).toFixed(2)} MB)`) // MB
            } catch (err) {
              console.warn('[Cache] Failed to evict', entry.url, err)
            }

            // Advance the cursor; the next cursor will be delivered on the
            // current request's onsuccess handler, so hook into it and recurse.
            cur!.continue()

            const req = cur!.request
            req.onsuccess = () => {
              const next = req.result as IDBCursorWithValue | null
              // Recurse for the next item
              processCursor(next).then(() => resolve())
            }

            req.onerror = () => resolve()
          })()
        })
      }

      processCursor(startCursor)
        .then(() => {
          // Update meta.totalBytes in store
          const metaReq2 = metaStore.get('meta')
          metaReq2.onsuccess = () => {
            const m = (metaReq2.result as MetaInfo) || { id: 'meta', totalBytes: 0, nextOrder: meta.nextOrder }
            m.totalBytes = total
            metaStore.put(m)
          }

          tx.oncomplete = () => {
            console.info(`[Cache] Reduced to ${(total / 1_073_741_824).toFixed(2)} GB`)
            resolve()
          }
        })
        .catch(err => reject(err))
    }

    cursorReq.onerror = () => reject(cursorReq.error)
  })
}

// --- Store Definition -------------------------------------------------------

export const useCacheStore = defineStore('albumCache', {
  state: () => ({
    activeCaching: new Map<string, { cancelled: boolean }>(),
  }),

  actions: {
    async hasTrack(url: string): Promise<boolean> {
      if (!url) return false
      const cache = await caches.open(CACHE_NAME)
      return !!(await cache.match(url))
    },

    async cacheTrack(url: string) {
      if (!url) return
      try {
        const cache = await caches.open(CACHE_NAME)
        const match = await cache.match(url)
        if (match) {
          console.info(`[Cache] Track already cached: ${url}`)
          return
        }

        const response = await fetch(url, { mode: 'cors', cache: 'force-cache' })
        if (!response.ok) {
          console.warn(`[Cache] Failed to fetch track: ${url} (${response.status})`)
          return
        }

        const clone = response.clone()
        const blob = await response.blob()

        await cache.put(url, clone)
        await putMeta(url, blob.size)
        await enforceCacheLimitFIFO()

        window.dispatchEvent(new CustomEvent('audioCached', { detail: url }))
        console.info(`[Cache] Cached track: ${url}`)
      } catch (err) {
        console.warn(`[Cache] Error caching track ${url}:`, err)
      }
    },

    async deleteTrack(url: string) {
      if (!url) return
      try {
        const cache = await caches.open(CACHE_NAME)
        const deleted = await cache.delete(url)
        if (deleted) {
          await deleteMeta(url)
          console.info(`[Cache] Track deleted: ${url}`)
          window.dispatchEvent(new CustomEvent('audioCacheDeleted', { detail: url }))
        } else {
          console.info(`[Cache] No matching track to delete: ${url}`)
        }
      } catch (err) {
        console.warn(`[Cache] Error deleting track ${url}:`, err)
      }
    },

    async clearAllAudioCache() {
      await caches.delete('airdrome-cache-v2')
      indexedDB.deleteDatabase('airdrome-cache-meta')
      window.dispatchEvent(new CustomEvent('audioCacheClearedAll'))
      console.info('[Cache] Cache deleted')
      return true
    },

    async cacheAlbum(album: Album) {
      if (!album?.tracks?.length) {
        console.warn('No tracks to cache for this album.')
        return
      }

      const key = album.id || album.name
      if (!key) {
        console.warn('Album has no identifier.')
        return
      }

      this.activeCaching.set(key, { cancelled: false })
      const session = this.activeCaching.get(key)!
      const cache = await caches.open(CACHE_NAME)

      const trackUrls = album.tracks
        .map(t => t.url)
        .filter((u): u is string => typeof u === 'string' && u.length > 0)

      const total = trackUrls.length
      let done = 0
      console.info(`Caching ${total} tracks for album "${album.name}"...`)

      for (const url of trackUrls) {
        if (session.cancelled) {
          console.info(`Caching for album "${album.name}" was cancelled.`)
          return
        }

        try {
          const match = await cache.match(url)
          if (!match) {
            const response = await fetch(url, { mode: 'cors' })
            if (response.ok) {
              const responseClone = response.clone()
              const blob = await response.blob()
              await cache.put(url, responseClone)
              await putMeta(url, blob.size)
              await enforceCacheLimitFIFO()
              done++
              console.info(`Cached [${done}/${total}] ${url}`)
              window.dispatchEvent(new CustomEvent('audioCached', { detail: url }))
            } else {
              console.warn(`Failed to fetch: ${url} (${response.status})`)
            }
          } else {
            console.info(`Already cached: ${url}`)
          }
        } catch (err) {
          console.warn(`Error caching ${url}:`, err)
        }

        await new Promise(resolve => setTimeout(resolve, 300))
      }

      console.info(`Finished caching album "${album.name}" (${done}/${total})`)
    },

    async clearAlbumCache(album: Album) {
      if (!album?.tracks?.length) {
        console.warn('No tracks found for this album.')
        return
      }

      const key = album.id || album.name
      if (key && this.activeCaching.has(key)) {
        this.activeCaching.get(key)!.cancelled = true
        await sleep(2000)
      }

      const cache = await caches.open(CACHE_NAME)
      const trackUrls = album.tracks
        .map(t => t.url)
        .filter((u): u is string => typeof u === 'string' && u.length > 0)

      let deleted = 0
      for (const url of trackUrls) {
        try {
          const success = await cache.delete(url)
          if (success) {
            deleted++
            await deleteMeta(url)
            console.info(`Removed from cache: ${url}`)
          }
        } catch (err) {
          console.warn(`Failed to remove ${url} from cache:`, err)
        }
      }

      console.info(`Cleared ${deleted}/${trackUrls.length} cached tracks for album "${album.name}".`)

      window.dispatchEvent(
        new CustomEvent('albumCacheCleared', {
          detail: { albumId: album.id, name: album.name, deleted },
        }),
      )
    },

    async isCached(album: Album): Promise<boolean> {
      if (!album?.tracks?.length) return false
      const cache = await caches.open(CACHE_NAME)
      for (const track of album.tracks) {
        if (!track.url) continue
        const match = await cache.match(track.url)
        if (match) return true
      }
      return false
    },

    async getCacheSizeGB(): Promise<number> {
      try {
        const meta = await getMetaInfo()
        const gb = meta.totalBytes / (1024 ** 3)
        return Math.round(gb * 10) / 10
      } catch (err) {
        console.warn('[Cache] Failed to measure cache size:', err)
        return 0
      }
    },
  },
})
