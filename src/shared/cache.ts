// src/shared/cache.ts
import { defineStore } from 'pinia'
import { Album } from '@/shared/api'
import { sleep } from '@/shared/utils'

import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
const isNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

const CACHE_DIR = 'audio-cache'
const CACHE_NAME = 'audio-cache-v1'

const META_DB = 'meta-cache-v1'
const META_STORE = 'entries'
const META_DB_VERSION = 4 // bumped: dropped the redundant running-total store

const MAX_CACHE_SIZE_BYTES = 3 * 1024 * 1024 * 1024 // 3 GB

const IMAGE_CACHE_NAME = 'images-cache-v1'
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

function hashName(url: string) {
  // Not cryptographic — fine for a cache filename, but collisions are
  // theoretically possible on a very large library. Swap for SubtleCrypto
  // SHA-1 if that ever becomes a real concern; kept sync/cheap here on
  // purpose since it runs on every cache write.
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0
  }

  const ext = url.split('.').pop()?.split('?')[0] || 'mp3'
  return `${Math.abs(hash)}.${ext}`
}

async function initNativeDir() {
  if (!isNative) return

  try {
    await Filesystem.mkdir({
      path: CACHE_DIR,
      directory: Directory.Data,
      recursive: true,
    })
  } catch {
    // already exists — fine
  }
}

/* -------------------------------------------------------------------------- */
/* Native (Android / Capacitor Filesystem)                                    */
/* -------------------------------------------------------------------------- */

async function nativeExists(filename: string) {
  try {
    await Filesystem.stat({
      path: `${CACHE_DIR}/${filename}`,
      directory: Directory.Data,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Download `url` and persist it to the native filesystem, recording a
 * matching IndexedDB entry. Returns the byte size written, or null on
 * failure (network error, non-OK response, write failure).
 */
async function nativeWrite(url: string): Promise<number | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null

    const blob = await res.blob()
    const base64 = await blobToBase64(blob)
    const filename = hashName(url)

    await Filesystem.writeFile({
      path: `${CACHE_DIR}/${filename}`,
      data: base64,
      directory: Directory.Data,
    })

    await putEntry({
      url,
      filename,
      size: blob.size,
      createdAt: Date.now(),
      lastAccess: Date.now(),
    })

    return blob.size
  } catch {
    return null
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function nativePlayable(url: string): Promise<string> {
  const entry = await getEntry(url)
  if (!entry) return url

  const exists = await nativeExists(entry.filename)
  if (!exists) return url

  await touch(url)

  const uri = await Filesystem.getUri({
    path: `${CACHE_DIR}/${entry.filename}`,
    directory: Directory.Data,
  })

  return Capacitor.convertFileSrc(uri.uri)
}

async function nativeDelete(entry: MetaEntry) {
  try {
    await Filesystem.deleteFile({
      path: `${CACHE_DIR}/${entry.filename}`,
      directory: Directory.Data,
    })
  } catch {
    // already gone — fine, we still clean up the IndexedDB entry below
  }
}

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

async function webPlayable(url: string): Promise<string> {
  const cache = await caches.open(CACHE_NAME)
  const hit = await cache.match(url)

  if (hit) await touch(url)

  return url
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

  if (isNative) {
    const exists = await nativeExists(entry.filename)
    if (exists) {
      await touch(url)
    } else {
      await deleteEntry(url) // phantom cleanup — size is derived, nothing else to fix
    }
    return exists
  }

  const cache = await caches.open(CACHE_NAME)
  const hit = await cache.match(url)

  if (hit) {
    await touch(url)
  } else {
    await deleteEntry(url)
  }

  return !!hit
}

/* -------------------------------------------------------------------------- */
/* LRU eviction                                                              */
/* -------------------------------------------------------------------------- */

async function enforceLimit() {
  let total = await totalCachedBytes()
  if (total <= MAX_CACHE_SIZE_BYTES) return

  const entries = await allEntries()
  entries.sort((a, b) => a.lastAccess - b.lastAccess)

  for (const e of entries) {
    if (total <= MAX_CACHE_SIZE_BYTES) break

    if (isNative) {
      await nativeDelete(e)
    } else {
      const cache = await caches.open(CACHE_NAME)
      await cache.delete(e.url) // ignore result — browser may have evicted already
    }

    await deleteEntry(e.url)
    total -= e.size
    dispatch('audioCacheDeleted', e.url)
  }

  dispatch('audioCacheEvicted')
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
    isCachingImages: false,
    imageCachedCount: null as number | null,
    imageCacheTotal: null as number | null,
  }),

  actions: {
    async init() {
      if (this.initialized) return
      if (isNative) await initNativeDir()
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

          const bytes = isNative ? await nativeWrite(url) : await webWrite(url)

          if (bytes !== null && bytes > 0) {
            await enforceLimit()
            dispatch('audioCached', url)
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

      if (!(await this.hasTrack(url))) {
        this.cacheTrack(url)
        return url
      }

      return isNative ? await nativePlayable(url) : await webPlayable(url)
    },

    async hasTrack(url: string) {
      return hasTrack(url)
    },

    async deleteTrack(url: string) {
      const entry = await getEntry(url)
      if (!entry) return

      if (isNative) {
        await nativeDelete(entry)
      } else {
        const cache = await caches.open(CACHE_NAME)
        await cache.delete(url)
      }

      await deleteEntry(url)
      dispatch('audioCacheDeleted', url)
    },

    async clearAllAudioCache() {
      if (isNative) {
        try {
          await Filesystem.rmdir({
            path: CACHE_DIR,
            directory: Directory.Data,
            recursive: true,
          })
        } catch {
          // nothing to remove — fine
        }
        await initNativeDir()
      } else {
        await caches.delete(CACHE_NAME)
      }

      await this.clearImageCache()

      // Reset the meta DB itself rather than deleting per-entry, then force
      // the next openDB() to reconnect.
      indexedDB.deleteDatabase(META_DB)
      dbPromise = null

      dispatch('audioCacheClearedAll')
      return true
    },

    async cacheAlbum(album: Album) {
      if (!album?.tracks?.length) return

      const key = album.id || album.name
      this.activeCaching.set(key, { cancelled: false })
      const session = this.activeCaching.get(key)!

      for (const t of album.tracks) {
        if (session.cancelled) return
        if (t.url) this.cacheTrack(t.url)
        await sleep(150)
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

      for (const t of album.tracks) {
        if (!t.url) continue
        if (!(await this.hasTrack(t.url))) return false
      }

      return true
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
