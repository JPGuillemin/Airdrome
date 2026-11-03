// src/shared/cache.ts
import { defineStore } from 'pinia'
import { Album } from '@/shared/api'
import { sleep } from '@/shared/utils'

const CACHE_NAME = 'audio-cache-v1'

const META_DB = 'meta-cache-v1'
const META_STORE = 'entries'
const META_DB_VERSION = 4 // bumped: dropped the redundant running-total store

const MAX_CACHE_SIZE_BYTES = 3 * 1024 * 1024 * 1024 // 3 GB

// Separate from the service worker's runtime image cache (`images-cache-v1`):
// the SW owns opportunistic cover-art caching, this cache is the explicit
// offline store. Keeping them apart means clearing one cannot nuke the other.
const IMAGE_CACHE_NAME = 'images-offline-v1'
const IMAGE_CONCURRENCY = 6

type MetaEntry = {
  url: string
  filename: string
  size: number
  createdAt: number
  lastAccess: number
}

function dispatch(name: string, detail?: any) {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

/* -------------------------------------------------------------------------- */
/* IndexedDB                                                                  */
/*                                                                            */
/* Single source of truth: the `entries` object store. There is no separate  */
/* running byte-total kept anywhere — total size is always derived from the  */
/* entries themselves on demand, so it can never drift out of sync with what */
/* is actually on disk (a stray crash or race could previously leave the old */
/* accumulated `totalBytes` counter permanently wrong).                      */
/* -------------------------------------------------------------------------- */

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(META_DB, META_DB_VERSION)

    req.onupgradeneeded = (event) => {
      const db = req.result
      const oldVersion = event.oldVersion

      if (!db.objectStoreNames.contains(META_STORE)) {
        const store = db.createObjectStore(META_STORE, { keyPath: 'url' })
        store.createIndex('lastAccess', 'lastAccess')
      }

      // Older versions kept a redundant `meta` running-total store — drop it,
      // totals are computed on demand from `entries` now.
      if (oldVersion < 4 && db.objectStoreNames.contains('meta')) {
        db.deleteObjectStore('meta')
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  return dbPromise
}

/**
 * Run a callback against the `entries` object store in a single
 * IDBTransaction, resolving once the transaction completes (not just once
 * the last request inside it succeeds). Centralises boilerplate that used
 * to be repeated — and re-opened as a fresh transaction — in every helper.
 */
async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => T
): Promise<T> {
  const db = await openDB()
  const tx = db.transaction(META_STORE, mode)
  const store = tx.objectStore(META_STORE)
  const result = fn(store)

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getEntry(url: string): Promise<MetaEntry | null> {
  const result = await withStore('readonly', (store) => reqToPromise(store.get(url)))
  return result ?? null
}

async function putEntry(entry: MetaEntry): Promise<void> {
  await withStore('readwrite', (store) => store.put(entry))
}

async function deleteEntry(url: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(url))
}

async function allEntries(): Promise<MetaEntry[]> {
  const result = await withStore('readonly', (store) => reqToPromise(store.getAll()))
  return result ?? []
}

/** Total bytes across all cached entries — always derived, never accumulated. */
async function totalCachedBytes(): Promise<number> {
  const entries = await allEntries()
  return entries.reduce((sum, e) => sum + e.size, 0)
}

async function touch(url: string): Promise<void> {
  await withStore('readwrite', (store) => {
    const req = store.get(url)
    req.onsuccess = () => {
      const entry = req.result as MetaEntry | undefined
      if (entry) {
        entry.lastAccess = Date.now()
        store.put(entry)
      }
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Object URLs handed to the audio element for cached tracks, keyed by source URL. */
const blobUrls = new Map<string, string>()

function revokeBlobUrl(url: string) {
  const objectUrl = blobUrls.get(url)
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    blobUrls.delete(url)
  }
}

/** In-flight bulk status scan, shared so row components don't duplicate it. */
let statusPriming: Promise<void> | null = null

/* -------------------------------------------------------------------------- */
/* Web (Cache API)                                                            */
/*                                                                            */
/* This is the app's own explicit cache — separate in purpose from anything  */
/* the service worker does. The SW no longer touches /rest/stream or         */
/* /rest/download at all (see service-worker.js), so this is now the single  */
/* writer of CACHE_NAME. No renaming needed to avoid collision.              */
/* -------------------------------------------------------------------------- */

async function webWrite(url: string): Promise<number | null> {
  try {
    const cache = await caches.open(CACHE_NAME)

    if (await cache.match(url)) {
      await touch(url)
      return 0
    }

    const res = await fetch(url)
    if (!res.ok) return null

    const clone = res.clone()
    const blob = await res.blob()

    await cache.put(url, clone)

    await putEntry({
      url,
      filename: '',
      size: blob.size,
      createdAt: Date.now(),
      lastAccess: Date.now(),
    })

    return blob.size
  } catch {
    return null
  }
}

/**
 * Return a URL the audio element can play. When the track is cached we hand
 * back a Blob URL backed by the cached response (so it works offline and can
 * be seeked without Range requests); otherwise the original network URL.
 */
async function webPlayable(url: string): Promise<string> {
  const cache = await caches.open(CACHE_NAME)
  const hit = await cache.match(url)

  if (!hit) return url

  await touch(url)

  const existing = blobUrls.get(url)
  if (existing) return existing

  const objectUrl = URL.createObjectURL(await hit.blob())
  blobUrls.set(url, objectUrl)
  return objectUrl
}

/**
 * Remove a track from both the metadata store and the actual Cache API
 * storage (plus any live Blob URL). Deleting only the metadata used to leave
 * the audio bytes on disk forever, so the LRU limit could never be enforced.
 */
async function removeCachedAudio(url: string, cache?: Cache): Promise<void> {
  await deleteEntry(url)
  revokeBlobUrl(url)
  const target = cache ?? await caches.open(CACHE_NAME)
  await target.delete(url)
}

/* -------------------------------------------------------------------------- */
/* Existence check + phantom cleanup                                         */
/*                                                                            */
/* "Phantom" = an IndexedDB entry whose underlying file/Cache-API entry has   */
/* disappeared (browser eviction, manual deletion, etc). Detected lazily on   */
/* access rather than swept proactively — cheap and self-healing.            */
/* -------------------------------------------------------------------------- */

async function hasTrack(url: string): Promise<boolean> {
  const entry = await getEntry(url)
  if (!entry) return false

  const cache = await caches.open(CACHE_NAME)
  const hit = await cache.match(url)

  // Read-only status check: `touch` is only needed when a track is actually
  // accessed for playback, not when the UI asks whether it is cached.
  if (!hit) await deleteEntry(url)

  return !!hit
}

/* -------------------------------------------------------------------------- */
/* LRU eviction                                                              */
/* -------------------------------------------------------------------------- */

async function enforceLimit(): Promise<string[]> {
  let total = await totalCachedBytes()
  if (total <= MAX_CACHE_SIZE_BYTES) return []

  const entries = await allEntries()
  entries.sort((a, b) => a.lastAccess - b.lastAccess)

  const evicted: string[] = []
  const cache = await caches.open(CACHE_NAME)
  for (const e of entries) {
    if (total <= MAX_CACHE_SIZE_BYTES) break

    await removeCachedAudio(e.url, cache)
    total -= e.size
    evicted.push(e.url)
    dispatch('audioCacheDeleted', e.url)
  }

  if (evicted.length) dispatch('audioCacheEvicted')
  return evicted
}

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

export const useCacheStore = defineStore('albumCache', {
  state: () => ({
    queue: [] as string[],
    queued: new Set<string>(),
    processing: false,
    initialized: false,
    activeCaching: new Map<string, { cancelled: boolean }>(),
    /** Reactive per-track cache status, shared by all row components. */
    cacheStatus: new Map<string, boolean>(),
    isCachingImages: false,
    imageCachedCount: null as number | null,
    imageCacheTotal: null as number | null,
  }),

  actions: {
    async init() {
      if (this.initialized) return
      this.initialized = true
    },

    async processQueue() {
      await this.init()
      if (this.processing) return
      this.processing = true // must be synchronous before first await

      try {
        while (this.queue.length) {
          const url = this.queue.shift()!
          this.queued.delete(url)

          if (await this.hasTrack(url)) continue

          const bytes = await webWrite(url)

          if (bytes !== null) {
            this.cacheStatus.set(url, true)
            if (bytes > 0) {
              const evicted = await enforceLimit()
              for (const evictedUrl of evicted) {
                this.cacheStatus.set(evictedUrl, false)
              }
              dispatch('audioCached', url)
            }
          }
        }
      } finally {
        this.processing = false
      }
    },

    async cacheTrack(url: string) {
      if (!url || this.queued.has(url)) return
      this.queue.push(url)
      this.queued.add(url)
      // processQueue guards itself with this.processing — safe to call repeatedly
      void this.processQueue()
    },

    async getCachedUrl(url: string) {
      await this.init()

      const playable = await webPlayable(url)
      // Not cached: play from the network and persist in the background.
      if (playable === url) this.cacheTrack(url)
      return playable
    },

    async hasTrack(url: string) {
      const cached = await hasTrack(url)
      this.cacheStatus.set(url, cached)
      return cached
    },

    /** Status for a single URL, using the shared map when already known. */
    async refreshStatus(url: string): Promise<boolean> {
      if (this.cacheStatus.has(url)) return this.cacheStatus.get(url)!

      // Wait for a bulk scan that may already be resolving this URL.
      if (statusPriming) await statusPriming
      if (this.cacheStatus.has(url)) return this.cacheStatus.get(url)!

      return this.hasTrack(url)
    },

    /**
     * Resolve cache status for many URLs with a single metadata read and a
     * single Cache API key scan, instead of two async lookups per row.
     */
    async primeStatus(urls: (string | undefined)[]): Promise<void> {
      const wanted = [...new Set(urls.filter((url): url is string => !!url))]
      if (!wanted.length) return
      if (wanted.every(url => this.cacheStatus.has(url))) return

      // Another list is already scanning; wait for it, then check again.
      if (statusPriming) {
        await statusPriming
        if (wanted.every(url => this.cacheStatus.has(url))) return
      }

      const task = (async () => {
        try {
          const [entries, cache] = await Promise.all([
            allEntries(),
            caches.open(CACHE_NAME),
          ])
          const entryUrls = new Set(entries.map(e => e.url))
          const cacheKeys = await cache.keys()
          const cachedUrls = new Set(cacheKeys.map(key => key.url))

          for (const url of wanted) {
            const inMetadata = entryUrls.has(url)
            const inCache = cachedUrls.has(url)
            this.cacheStatus.set(url, inMetadata && inCache)
            // Phantom metadata entry: the bytes are gone, clean it up.
            if (inMetadata && !inCache) await deleteEntry(url)
          }
        } catch (err) {
          console.warn('[cache] primeStatus failed', err)
        }
      })()

      statusPriming = task
      try {
        await task
      } finally {
        if (statusPriming === task) statusPriming = null
      }
    },

    async deleteTrack(url: string) {
      const entry = await getEntry(url)
      const cache = await caches.open(CACHE_NAME)
      const hadBlob = await cache.delete(url)
      await deleteEntry(url)
      revokeBlobUrl(url)
      this.cacheStatus.set(url, false)

      if (entry || hadBlob) dispatch('audioCacheDeleted', url)
    },

    async clearAllAudioCache() {
      await caches.delete(CACHE_NAME)
      for (const url of [...blobUrls.keys()]) revokeBlobUrl(url)
      this.cacheStatus.clear()

      await this.clearImageCache()

      // Reset the meta DB itself rather than deleting per-entry, then force
      // the next openDB() to reconnect. Close the open connection first so
      // the deletion is not blocked indefinitely.
      try {
        const db = await openDB()
        db.close()
      } catch {
        // no open database — nothing to close
      }
      dbPromise = null
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(META_DB)
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
        req.onblocked = () => resolve()
      })

      dispatch('audioCacheClearedAll')
      return true
    },

    async cacheAlbum(album: Album) {
      if (!album?.tracks?.length) return

      const key = album.id || album.name
      this.activeCaching.set(key, { cancelled: false })
      const session = this.activeCaching.get(key)!

      try {
        for (const t of album.tracks) {
          if (session.cancelled) return
          if (t.url) this.cacheTrack(t.url)
          await sleep(150)
        }
      } finally {
        this.activeCaching.delete(key)
      }
    },

    async clearAlbumCache(album: Album) {
      if (!album?.tracks?.length) return

      for (const t of album.tracks) {
        if (t.url) await this.deleteTrack(t.url)
      }
    },

    async isCached(album: Album) {
      if (!album?.tracks?.length) return false

      const urls = album.tracks.map(t => t.url).filter((url): url is string => !!url)
      if (!urls.length) return false

      await this.primeStatus(urls)
      return urls.every(url => this.cacheStatus.get(url) === true)
    },

    async getCacheSizeMB() {
      const bytes = await totalCachedBytes()
      return Math.round(bytes / 1024 ** 2)
    },

    // ── Image cache — unchanged from the original: this store remains the ──
    // owner of image caching (not the service worker), same Cache API name,
    // same concurrency-limited fetch loop.
    beginImageCacheCollection() {
      this.isCachingImages = true
      this.imageCacheTotal = null
      this.imageCachedCount = null
    },

    async cacheImages(urls: string[]) {
      if (!this.isCachingImages) this.isCachingImages = true

      try {
        const cache = await caches.open(IMAGE_CACHE_NAME)
        const all = [...new Set(urls)]
        this.imageCacheTotal = all.length
        this.imageCachedCount = 0

        const queue = [...all]
        const worker = async () => {
          while (queue.length) {
            const url = queue.shift()!
            try {
              if (!(await cache.match(url))) {
                const res = await fetch(url)
                if (res.ok) await cache.put(url, res)
              }
            } catch {
              // network error for this image — skip silently
            }
            this.imageCachedCount!++
          }
        }

        await Promise.all(Array.from({ length: IMAGE_CONCURRENCY }, worker))
      } finally {
        this.isCachingImages = false
        this.imageCacheTotal = null
      }
    },

    async getImageCachedCount(): Promise<number> {
      try {
        const cache = await caches.open(IMAGE_CACHE_NAME)
        const keys = await cache.keys()
        return keys.length
      } catch {
        return 0
      }
    },

    async clearImageCache() {
      await caches.delete(IMAGE_CACHE_NAME)
      this.imageCachedCount = 0
      this.imageCacheTotal = null
    },
  },
})
