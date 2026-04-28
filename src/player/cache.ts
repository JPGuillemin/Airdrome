// src/player/cache.ts
import { defineStore } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Album } from '@/shared/api'
import { sleep } from '@/shared/utils'

const isNative = Capacitor.isNativePlatform()

const CACHE_DIR = 'audio-cache'
const CACHE_NAME = 'airdrome-cache-v3'

const META_DB = 'airdrome-cache-meta'
const META_STORE = 'entries'
const META_INFO = 'meta'

const MAX_CACHE_SIZE_BYTES = 5 * 1024 * 1024 * 1024 // 5 GB

type MetaEntry = {
  url: string
  filename: string
  size: number
  createdAt: number
  lastAccess: number
}

type MetaInfo = {
  id: 'meta'
  totalBytes: number
}

function dispatch(name: string, detail?: any) {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

/* -------------------------------------------------------------------------- */
/* IndexedDB                                                                  */
/* -------------------------------------------------------------------------- */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(META_DB, 3)

    req.onupgradeneeded = () => {
      const db = req.result

      if (!db.objectStoreNames.contains(META_STORE)) {
        const store = db.createObjectStore(META_STORE, { keyPath: 'url' })
        store.createIndex('lastAccess', 'lastAccess')
      }

      if (!db.objectStoreNames.contains(META_INFO)) {
        db.createObjectStore(META_INFO, { keyPath: 'id' })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getMetaInfo(): Promise<MetaInfo> {
  const db = await openDB()

  return new Promise(resolve => {
    const tx = db.transaction(META_INFO, 'readonly')
    const req = tx.objectStore(META_INFO).get('meta')

    req.onsuccess = () =>
      resolve(req.result || { id: 'meta', totalBytes: 0 })

    req.onerror = () =>
      resolve({ id: 'meta', totalBytes: 0 })
  })
}

async function setMetaInfo(info: MetaInfo) {
  const db = await openDB()

  return new Promise<void>(resolve => {
    const tx = db.transaction(META_INFO, 'readwrite')
    tx.objectStore(META_INFO).put(info)
    tx.oncomplete = () => resolve()
  })
}

async function getEntry(url: string): Promise<MetaEntry | null> {
  const db = await openDB()

  return new Promise(resolve => {
    const tx = db.transaction(META_STORE, 'readonly')
    const req = tx.objectStore(META_STORE).get(url)

    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => resolve(null)
  })
}

async function putEntry(entry: MetaEntry) {
  const db = await openDB()

  return new Promise<void>(resolve => {
    const tx = db.transaction(META_STORE, 'readwrite')
    tx.objectStore(META_STORE).put(entry)
    tx.oncomplete = () => resolve()
  })
}

async function deleteEntry(url: string) {
  const db = await openDB()

  return new Promise<void>(resolve => {
    const tx = db.transaction(META_STORE, 'readwrite')
    tx.objectStore(META_STORE).delete(url)
    tx.oncomplete = () => resolve()
  })
}

async function allEntries(): Promise<MetaEntry[]> {
  const db = await openDB()

  return new Promise(resolve => {
    const tx = db.transaction(META_STORE, 'readonly')
    const req = tx.objectStore(META_STORE).getAll()

    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => resolve([])
  })
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function shaName(url: string) {
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
  } catch {}
}

async function touch(url: string) {
  const entry = await getEntry(url)
  if (!entry) return

  entry.lastAccess = Date.now()
  await putEntry(entry)
}

async function increaseSize(bytes: number) {
  const meta = await getMetaInfo()
  meta.totalBytes += bytes
  await setMetaInfo(meta)
}

async function decreaseSize(bytes: number) {
  const meta = await getMetaInfo()
  meta.totalBytes = Math.max(0, meta.totalBytes - bytes)
  await setMetaInfo(meta)
}

/* -------------------------------------------------------------------------- */
/* Native                                                                     */
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

async function nativeWrite(url: string): Promise<number | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null

    const blob = await res.blob()
    const reader = new FileReader()

    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

    const base64 = dataUrl.split(',')[1]
    const filename = shaName(url)

    await Filesystem.writeFile({
      path: `${CACHE_DIR}/${filename}`,
      data: base64,
      directory: Directory.Data,
    })

    const entry: MetaEntry = {
      url,
      filename,
      size: blob.size,
      createdAt: Date.now(),
      lastAccess: Date.now(),
    }

    await putEntry(entry)
    await increaseSize(blob.size)

    return blob.size
  } catch {
    return null
  }
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

/* -------------------------------------------------------------------------- */
/* Web                                                                        */
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

    const entry: MetaEntry = {
      url,
      filename: '',
      size: blob.size,
      createdAt: Date.now(),
      lastAccess: Date.now(),
    }

    await putEntry(entry)
    await increaseSize(blob.size)

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
/* LRU                                                                        */
/* -------------------------------------------------------------------------- */

async function enforceLimit() {
  const meta = await getMetaInfo()
  if (meta.totalBytes <= MAX_CACHE_SIZE_BYTES) return

  const entries = await allEntries()
  entries.sort((a, b) => a.lastAccess - b.lastAccess)

  for (const e of entries) {
    if (meta.totalBytes <= MAX_CACHE_SIZE_BYTES) break

    if (isNative) {
      try {
        await Filesystem.deleteFile({
          path: `${CACHE_DIR}/${e.filename}`,
          directory: Directory.Data,
        })
      } catch {}
    } else {
      const cache = await caches.open(CACHE_NAME)
      await cache.delete(e.url)
    }

    await deleteEntry(e.url)
    await decreaseSize(e.size)
    meta.totalBytes -= e.size

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

      this.processing = true

      while (this.queue.length) {
        const url = this.queue.shift()!
        this.queued.delete(url)

        const exists = await this.hasTrack(url)
        if (exists) continue

        const bytes = isNative
          ? await nativeWrite(url)
          : await webWrite(url)

        if (bytes !== null) {
          await enforceLimit()
          dispatch('audioCached', url)
        }
      }

      this.processing = false
    },

    async cacheTrack(url: string) {
      if (!url || this.queued.has(url)) return

      this.queue.push(url)
      this.queued.add(url)

      if (!this.processing) this.processQueue()
    },

    async getPlayableUrl(url: string) {
      await this.init()

      const cached = await this.hasTrack(url)
      if (!cached) {
        this.cacheTrack(url)
        return url
      }

      return isNative
        ? await nativePlayable(url)
        : await webPlayable(url)
    },

    async hasTrack(url: string) {
      const entry = await getEntry(url)
      if (!entry) return false

      if (isNative) {
        const ok = await nativeExists(entry.filename)
        if (ok) await touch(url)
        return ok
      }

      const cache = await caches.open(CACHE_NAME)
      const hit = await cache.match(url)
      if (hit) await touch(url)

      return !!hit
    },

    async deleteTrack(url: string) {
      const entry = await getEntry(url)
      if (!entry) return

      if (isNative) {
        try {
          await Filesystem.deleteFile({
            path: `${CACHE_DIR}/${entry.filename}`,
            directory: Directory.Data,
          })
        } catch {}
      } else {
        const cache = await caches.open(CACHE_NAME)
        await cache.delete(url)
      }

      await deleteEntry(url)
      await decreaseSize(entry.size)

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
        } catch {}

        await initNativeDir()
      } else {
        await caches.delete(CACHE_NAME)
      }

      indexedDB.deleteDatabase(META_DB)

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
      const meta = await getMetaInfo()
      return Math.round(meta.totalBytes / 1024 ** 2)
    },
  },
})
