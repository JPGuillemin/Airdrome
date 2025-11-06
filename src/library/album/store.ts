import { defineStore } from 'pinia'
import { Album } from '@/shared/api'
import { sleep } from '@/shared/utils'

const CACHE_NAME = 'airdrome-cache-v2'
const META_DB_NAME = 'airdrome-cache-meta'
const META_STORE_NAME = 'entries'
const MAX_CACHE_SIZE_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB

// --- IndexedDB Helpers ------------------------------------------------------

function openMetaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(META_DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(META_STORE_NAME)) {
        db.createObjectStore(META_STORE_NAME, { keyPath: 'url' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getAllMeta(): Promise<{ url: string; size: number; timestamp: number }[]> {
  const db = await openMetaDB()
  return new Promise(resolve => {
    const tx = db.transaction(META_STORE_NAME, 'readonly')
    const store = tx.objectStore(META_STORE_NAME)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve([])
  })
}

async function putMeta(url: string, size: number) {
  const db = await openMetaDB()
  const tx = db.transaction(META_STORE_NAME, 'readwrite')
  tx.objectStore(META_STORE_NAME).put({ url, size, timestamp: Date.now() })
  return new Promise(resolve => (tx.oncomplete = resolve))
}

async function deleteMeta(url: string) {
  const db = await openMetaDB()
  const tx = db.transaction(META_STORE_NAME, 'readwrite')
  tx.objectStore(META_STORE_NAME).delete(url)
  return new Promise(resolve => (tx.oncomplete = resolve))
}

async function enforceCacheLimitFIFO() {
  const cache = await caches.open(CACHE_NAME)
  const entries = await getAllMeta()
  let total = entries.reduce((sum, e) => sum + e.size, 0)

  if (total <= MAX_CACHE_SIZE_BYTES) return

  // Sort by oldest first
  entries.sort((a, b) => a.timestamp - b.timestamp)

  console.info('[Cache] Exceeds 10GB — pruning oldest entries...')
  for (const entry of entries) {
    if (total <= MAX_CACHE_SIZE_BYTES) break
    await cache.delete(entry.url)
    await deleteMeta(entry.url)
    total -= entry.size
    console.info(`[Cache] Evicted ${entry.url} (${(entry.size / 1_048_576).toFixed(2)} MB)`)
  }

  console.info(`[Cache] Reduced to ${(total / 1_073_741_824).toFixed(2)} GB`)
}

// --- Store Definition -------------------------------------------------------

export const useAlbumCacheStore = defineStore('albumCache', {
  state: () => ({
    activeCaching: new Map<string, { cancelled: boolean }>(),
  }),

  actions: {
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
  },
})
