// shared/cache.js
//
// Offline audio and image caching. Written in an explicit, ES5-friendly
// style: var, function declarations/expressions, explicit property access
// and async/await instead of promise chains.

import { defineStore } from 'pinia'
import { sleep } from '@/shared/utils'

var CACHE_NAME = 'audio-cache-v1'

var META_DB = 'meta-cache-v1'
var META_STORE = 'entries'
var META_DB_VERSION = 4 // bumped: dropped the redundant running-total store

var MAX_CACHE_SIZE_BYTES = 3 * 1024 * 1024 * 1024 // 3 GB

// Separate from the service worker's runtime image cache (`images-cache-v1`):
// the SW owns opportunistic cover-art caching, this cache is the explicit
// offline store. Keeping them apart means clearing one cannot nuke the other.
var IMAGE_CACHE_NAME = 'images-offline-v1'
var IMAGE_CONCURRENCY = 6

/**
 * @typedef {Object} MetaEntry
 * @property {string} url
 * @property {string} filename
 * @property {number} size
 * @property {number} createdAt
 * @property {number} lastAccess
 */

/**
 * @typedef {Object} CacheSession
 * @property {boolean} cancelled
 */

/**
 * @typedef {import('@/shared/api').Album} Album
 */

/**
 * Public shape of the store state.
 *
 * @typedef {Object} CacheState
 * @property {string[]} queue
 * @property {Set<string>} queued
 * @property {boolean} processing
 * @property {boolean} initialized
 * @property {Map<string, CacheSession>} activeCaching
 * @property {Map<string, boolean>} cacheStatus
 * @property {boolean} isCachingImages
 * @property {number|null} imageCachedCount
 * @property {number|null} imageCacheTotal
 */

/**
 * Broadcast a cache lifecycle event.
 *
 * @param {string} name
 * @param {*} [detail]
 * @returns {void}
 */
function dispatch(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail: detail }))
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

var dbPromise = null

/**
 * Open (and cache) the metadata database.
 *
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (dbPromise) {
    return dbPromise
  }

  dbPromise = new Promise(function(resolve, reject) {
    var req = indexedDB.open(META_DB, META_DB_VERSION)

    req.onupgradeneeded = function(event) {
      var db = req.result
      var oldVersion = event.oldVersion

      if (!db.objectStoreNames.contains(META_STORE)) {
        var store = db.createObjectStore(META_STORE, { keyPath: 'url' })
        store.createIndex('lastAccess', 'lastAccess')
      }

      // Older versions kept a redundant `meta` running-total store — drop it,
      // totals are computed on demand from `entries` now.
      if (oldVersion < 4 && db.objectStoreNames.contains('meta')) {
        db.deleteObjectStore('meta')
      }
    }

    req.onsuccess = function() {
      resolve(req.result)
    }

    req.onerror = function() {
      reject(req.error)
    }
  })

  return dbPromise
}

/**
 * Run a callback against the `entries` object store in a single
 * IDBTransaction, resolving once the transaction completes (not just once
 * the last request inside it succeeds). Centralises boilerplate that used
 * to be repeated — and re-opened as a fresh transaction — in every helper.
 *
 * @template T
 * @param {IDBTransactionMode} mode
 * @param {function(IDBObjectStore): T} fn
 * @returns {Promise<T>}
 */
async function withStore(mode, fn) {
  var db = await openDB()
  var tx = db.transaction(META_STORE, mode)
  var store = tx.objectStore(META_STORE)
  var result = fn(store)

  return new Promise(function(resolve, reject) {
    tx.oncomplete = function() {
      resolve(result)
    }

    tx.onerror = function() {
      reject(tx.error)
    }

    tx.onabort = function() {
      reject(tx.error)
    }
  })
}

/**
 * Wrap an IDBRequest in a promise.
 *
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
function reqToPromise(req) {
  return new Promise(function(resolve, reject) {
    req.onsuccess = function() {
      resolve(req.result)
    }

    req.onerror = function() {
      reject(req.error)
    }
  })
}

/**
 * Read a single metadata entry.
 *
 * @param {string} url
 * @returns {Promise<MetaEntry|null>}
 */
async function getEntry(url) {
  var result = await withStore('readonly', function(store) {
    return reqToPromise(store.get(url))
  })

  if (result == null) {
    return null
  }

  return result
}

/**
 * Write a single metadata entry.
 *
 * @param {MetaEntry} entry
 * @returns {Promise<void>}
 */
async function putEntry(entry) {
  await withStore('readwrite', function(store) {
    return store.put(entry)
  })
}

/**
 * Delete a single metadata entry.
 *
 * @param {string} url
 * @returns {Promise<void>}
 */
async function deleteEntry(url) {
  await withStore('readwrite', function(store) {
    return store.delete(url)
  })
}

/**
 * Read every metadata entry.
 *
 * @returns {Promise<MetaEntry[]>}
 */
async function allEntries() {
  var result = await withStore('readonly', function(store) {
    return reqToPromise(store.getAll())
  })

  if (result == null) {
    return []
  }

  return result
}

/**
 * Total bytes across all cached entries — always derived, never accumulated.
 *
 * @returns {Promise<number>}
 */
async function totalCachedBytes() {
  var entries = await allEntries()
  var sum = 0

  for (var i = 0; i < entries.length; i++) {
    sum += entries[i].size
  }

  return sum
}

/**
 * Update the lastAccess timestamp of an entry.
 *
 * @param {string} url
 * @returns {Promise<void>}
 */
async function touch(url) {
  await withStore('readwrite', function(store) {
    var req = store.get(url)

    req.onsuccess = function() {
      var entry = req.result

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
var blobUrls = new Map()

/**
 * Revoke and forget the Blob URL for a source URL.
 *
 * @param {string} url
 * @returns {void}
 */
function revokeBlobUrl(url) {
  var objectUrl = blobUrls.get(url)

  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    blobUrls.delete(url)
  }
}

/** In-flight bulk status scan, shared so row components don't duplicate it. */
var statusPriming = null

/* -------------------------------------------------------------------------- */
/* Web (Cache API)                                                            */
/*                                                                            */
/* This is the app's own explicit cache — separate in purpose from anything  */
/* the service worker does. The SW no longer touches /rest/stream or         */
/* /rest/download at all (see service-worker.js), so this is now the single  */
/* writer of CACHE_NAME. No renaming needed to avoid collision.              */
/* -------------------------------------------------------------------------- */

/**
 * Download a track into the Cache API and record its metadata.
 *
 * @param {string} url
 * @returns {Promise<number|null>} Bytes written, 0 when already cached,
 *   or null when the fetch failed.
 */
async function webWrite(url) {
  try {
    var cache = await caches.open(CACHE_NAME)

    if (await cache.match(url)) {
      await touch(url)
      return 0
    }

    var res = await fetch(url)

    if (!res.ok) {
      return null
    }

    var clone = res.clone()
    var blob = await res.blob()

    await cache.put(url, clone)

    await putEntry({
      url: url,
      filename: '',
      size: blob.size,
      createdAt: Date.now(),
      lastAccess: Date.now()
    })

    return blob.size
  } catch (error) {
    return null
  }
}

/**
 * Return a URL the audio element can play. When the track is cached we hand
 * back a Blob URL backed by the cached response (so it works offline and can
 * be seeked without Range requests); otherwise the original network URL.
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
async function webPlayable(url) {
  var cache = await caches.open(CACHE_NAME)
  var hit = await cache.match(url)

  if (!hit) {
    return url
  }

  await touch(url)

  var existing = blobUrls.get(url)

  if (existing) {
    return existing
  }

  var objectUrl = URL.createObjectURL(await hit.blob())
  blobUrls.set(url, objectUrl)
  return objectUrl
}

/**
 * Remove a track from both the metadata store and the actual Cache API
 * storage (plus any live Blob URL). Deleting only the metadata used to leave
 * the audio bytes on disk forever, so the LRU limit could never be enforced.
 *
 * @param {string} url
 * @param {Cache} [cache]
 * @returns {Promise<void>}
 */
async function removeCachedAudio(url, cache) {
  await deleteEntry(url)
  revokeBlobUrl(url)

  var target = cache

  if (!target) {
    target = await caches.open(CACHE_NAME)
  }

  await target.delete(url)
}

/* -------------------------------------------------------------------------- */
/* Existence check + phantom cleanup                                         */
/*                                                                            */
/* "Phantom" = an IndexedDB entry whose underlying file/Cache-API entry has   */
/* disappeared (browser eviction, manual deletion, etc). Detected lazily on  */
/* access rather than swept proactively — cheap and self-healing.            */
/* -------------------------------------------------------------------------- */

/**
 * Return true when a track is both in the metadata store and the Cache API.
 * A phantom metadata entry is removed on the way out.
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function hasTrack(url) {
  var entry = await getEntry(url)

  if (!entry) {
    return false
  }

  var cache = await caches.open(CACHE_NAME)
  var hit = await cache.match(url)

  // Read-only status check: `touch` is only needed when a track is actually
  // accessed for playback, not when the UI asks whether it is cached.
  if (!hit) {
    await deleteEntry(url)
  }

  return !!hit
}

/* -------------------------------------------------------------------------- */
/* LRU eviction                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Evict least-recently-used tracks until the cache is under the limit.
 *
 * @returns {Promise<string[]>} URLs that were evicted.
 */
async function enforceLimit() {
  var total = await totalCachedBytes()

  if (total <= MAX_CACHE_SIZE_BYTES) {
    return []
  }

  var entries = await allEntries()
  entries.sort(function(a, b) {
    return a.lastAccess - b.lastAccess
  })

  var evicted = []
  var cache = await caches.open(CACHE_NAME)

  for (var i = 0; i < entries.length; i++) {
    if (total <= MAX_CACHE_SIZE_BYTES) {
      break
    }

    var entry = entries[i]

    await removeCachedAudio(entry.url, cache)
    total -= entry.size
    evicted.push(entry.url)
    dispatch('audioCacheDeleted', entry.url)
  }

  if (evicted.length) {
    dispatch('audioCacheEvicted')
  }

  return evicted
}

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

export var useCacheStore = defineStore('albumCache', {
  state: function() {
    /** @type {CacheState} */
    var state = {
      /** Pending track URLs waiting to be written to the Cache API. */
      queue: [],

      /** URLs currently present in `queue`, for O(1) de-duplication. */
      queued: new Set(),

      /** True while the queue worker is draining. */
      processing: false,

      /** True once `init()` has run. */
      initialized: false,

      /** In-flight album caching sessions, keyed by album id or name. */
      activeCaching: new Map(),

      /** Reactive per-track cache status, shared by all row components. */
      cacheStatus: new Map(),

      /** True while the image cache worker is running. */
      isCachingImages: false,

      /** Number of images processed in the current run (null when idle). */
      imageCachedCount: null,

      /** Total images in the current run (null when idle). */
      imageCacheTotal: null
    }

    return state
  },

  actions: {
    /**
     * Mark the store as initialised.
     *
     * @returns {Promise<void>}
     */
    init: async function() {
      if (this.initialized) {
        return
      }

      this.initialized = true
    },

    /**
     * Drain the pending queue, writing each track to the Cache API.
     *
     * @returns {Promise<void>}
     */
    processQueue: async function() {
      await this.init()

      if (this.processing) {
        return
      }

      this.processing = true // must be synchronous before first await

      try {
        while (this.queue.length) {
          var url = this.queue.shift()
          this.queued.delete(url)

          if (await this.hasTrack(url)) {
            continue
          }

          var bytes = await webWrite(url)

          if (bytes !== null) {
            this.cacheStatus.set(url, true)

            if (bytes > 0) {
              var evicted = await enforceLimit()

              for (var i = 0; i < evicted.length; i++) {
                this.cacheStatus.set(evicted[i], false)
              }

              dispatch('audioCached', url)
            }
          }
        }
      } finally {
        this.processing = false
      }
    },

    /**
     * Queue a track for caching.
     *
     * @param {string} url
     * @returns {Promise<void>}
     */
    cacheTrack: async function(url) {
      if (!url || this.queued.has(url)) {
        return
      }

      this.queue.push(url)
      this.queued.add(url)
      // processQueue guards itself with this.processing — safe to call repeatedly
      void this.processQueue()
    },

    /**
     * Return a playable URL for a track, caching it in the background when
     * it is not cached yet.
     *
     * @param {string} url
     * @returns {Promise<string>}
     */
    getCachedUrl: async function(url) {
      await this.init()

      var playable = await webPlayable(url)

      // Not cached: play from the network and persist in the background.
      if (playable === url) {
        this.cacheTrack(url)
      }

      return playable
    },

    /**
     * Refresh and return the cache status for one URL.
     *
     * @param {string} url
     * @returns {Promise<boolean>}
     */
    hasTrack: async function(url) {
      var cached = await hasTrack(url)
      this.cacheStatus.set(url, cached)
      return cached
    },

    /**
     * Status for a single URL, using the shared map when already known.
     *
     * @param {string} url
     * @returns {Promise<boolean>}
     */
    refreshStatus: async function(url) {
      if (this.cacheStatus.has(url)) {
        return this.cacheStatus.get(url)
      }

      // Wait for a bulk scan that may already be resolving this URL.
      if (statusPriming) {
        await statusPriming
      }

      if (this.cacheStatus.has(url)) {
        return this.cacheStatus.get(url)
      }

      return this.hasTrack(url)
    },

    /**
     * Resolve cache status for many URLs with a single metadata read and a
     * single Cache API key scan, instead of two async lookups per row.
     *
     * @param {Array<string|undefined>} urls
     * @returns {Promise<void>}
     */
    primeStatus: async function(urls) {
      var self = this
      var unique = new Set()

      for (var i = 0; i < urls.length; i++) {
        if (urls[i]) {
          unique.add(urls[i])
        }
      }

      var wanted = Array.from(unique)

      if (!wanted.length) {
        return
      }

      function allKnown() {
        for (var j = 0; j < wanted.length; j++) {
          if (!self.cacheStatus.has(wanted[j])) {
            return false
          }
        }

        return true
      }

      if (allKnown()) {
        return
      }

      // Another list is already scanning; wait for it, then check again.
      if (statusPriming) {
        await statusPriming

        if (allKnown()) {
          return
        }
      }

      var task = (async function() {
        try {
          var results = await Promise.all([
            allEntries(),
            caches.open(CACHE_NAME)
          ])
          var entries = results[0]
          var cache = results[1]

          var entryUrls = new Set()

          for (var k = 0; k < entries.length; k++) {
            entryUrls.add(entries[k].url)
          }

          var cacheKeys = await cache.keys()
          var cachedUrls = new Set()

          for (var m = 0; m < cacheKeys.length; m++) {
            cachedUrls.add(cacheKeys[m].url)
          }

          for (var n = 0; n < wanted.length; n++) {
            var url = wanted[n]
            var inMetadata = entryUrls.has(url)
            var inCache = cachedUrls.has(url)

            self.cacheStatus.set(url, inMetadata && inCache)

            // Phantom metadata entry: the bytes are gone, clean it up.
            if (inMetadata && !inCache) {
              await deleteEntry(url)
            }
          }
        } catch (err) {
          console.warn('[cache] primeStatus failed', err)
        }
      })()

      statusPriming = task

      try {
        await task
      } finally {
        if (statusPriming === task) {
          statusPriming = null
        }
      }
    },

    /**
     * Delete one track from the audio cache.
     *
     * @param {string} url
     * @returns {Promise<void>}
     */
    deleteTrack: async function(url) {
      var entry = await getEntry(url)
      var cache = await caches.open(CACHE_NAME)
      var hadBlob = await cache.delete(url)

      await deleteEntry(url)
      revokeBlobUrl(url)
      this.cacheStatus.set(url, false)

      if (entry || hadBlob) {
        dispatch('audioCacheDeleted', url)
      }
    },

    /**
     * Clear the audio cache, the image cache and the metadata database.
     *
     * @returns {Promise<boolean>}
     */
    clearAllAudioCache: async function() {
      await caches.delete(CACHE_NAME)

      var keys = Array.from(blobUrls.keys())

      for (var i = 0; i < keys.length; i++) {
        revokeBlobUrl(keys[i])
      }

      this.cacheStatus.clear()

      await this.clearImageCache()

      // Reset the meta DB itself rather than deleting per-entry, then force
      // the next openDB() to reconnect. Close the open connection first so
      // the deletion is not blocked indefinitely.
      try {
        var db = await openDB()
        db.close()
      } catch (error) {
        // no open database — nothing to close
      }

      dbPromise = null

      await new Promise(function(resolve) {
        var req = indexedDB.deleteDatabase(META_DB)

        req.onsuccess = function() {
          resolve()
        }

        req.onerror = function() {
          resolve()
        }

        req.onblocked = function() {
          resolve()
        }
      })

      dispatch('audioCacheClearedAll')
      return true
    },

    /**
     * Cache every track of an album, with a small delay between tracks.
     *
     * @param {Album} album
     * @returns {Promise<void>}
     */
    cacheAlbum: async function(album) {
      if (!album || !album.tracks || !album.tracks.length) {
        return
      }

      var key = album.id || album.name
      this.activeCaching.set(key, { cancelled: false })

      var session = this.activeCaching.get(key)

      try {
        for (var i = 0; i < album.tracks.length; i++) {
          if (session.cancelled) {
            return
          }

          var track = album.tracks[i]

          if (track.url) {
            this.cacheTrack(track.url)
          }

          await sleep(150)
        }
      } finally {
        this.activeCaching.delete(key)
      }
    },

    /**
     * Delete every cached track of an album.
     *
     * @param {Album} album
     * @returns {Promise<void>}
     */
    clearAlbumCache: async function(album) {
      if (!album || !album.tracks || !album.tracks.length) {
        return
      }

      for (var i = 0; i < album.tracks.length; i++) {
        var track = album.tracks[i]

        if (track.url) {
          await this.deleteTrack(track.url)
        }
      }
    },

    /**
     * Return true when every track of an album is cached.
     *
     * @param {Album} album
     * @returns {Promise<boolean>}
     */
    isCached: async function(album) {
      if (!album || !album.tracks || !album.tracks.length) {
        return false
      }

      var urls = []

      for (var i = 0; i < album.tracks.length; i++) {
        if (album.tracks[i].url) {
          urls.push(album.tracks[i].url)
        }
      }

      if (!urls.length) {
        return false
      }

      await this.primeStatus(urls)

      for (var j = 0; j < urls.length; j++) {
        if (this.cacheStatus.get(urls[j]) !== true) {
          return false
        }
      }

      return true
    },

    /**
     * Return the total audio cache size in megabytes.
     *
     * @returns {Promise<number>}
     */
    getCacheSizeMB: async function() {
      var bytes = await totalCachedBytes()
      return Math.round(bytes / (1024 * 1024))
    },

    // ── Image cache — unchanged from the original: this store remains the ──
    // owner of image caching (not the service worker), same Cache API name,
    // same concurrency-limited fetch loop.

    /**
     * Reset the image cache progress counters before a run.
     *
     * @returns {void}
     */
    beginImageCacheCollection: function() {
      this.isCachingImages = true
      this.imageCacheTotal = null
      this.imageCachedCount = null
    },

    /**
     * Fetch and store a list of images with limited concurrency.
     *
     * @param {string[]} urls
     * @returns {Promise<void>}
     */
    cacheImages: async function(urls) {
      if (!this.isCachingImages) {
        this.isCachingImages = true
      }

      try {
        var cache = await caches.open(IMAGE_CACHE_NAME)
        var unique = new Set()

        for (var i = 0; i < urls.length; i++) {
          unique.add(urls[i])
        }

        var all = Array.from(unique)
        this.imageCacheTotal = all.length
        this.imageCachedCount = 0

        var queue = all.slice()
        var self = this

        var worker = async function() {
          while (queue.length) {
            var url = queue.shift()

            try {
              if (!(await cache.match(url))) {
                var res = await fetch(url)

                if (res.ok) {
                  await cache.put(url, res)
                }
              }
            } catch (error) {
              // network error for this image — skip silently
            }

            self.imageCachedCount += 1
          }
        }

        var workers = []

        for (var j = 0; j < IMAGE_CONCURRENCY; j++) {
          workers.push(worker())
        }

        await Promise.all(workers)
      } finally {
        this.isCachingImages = false
        this.imageCacheTotal = null
      }
    },

    /**
     * Count the images currently held in the image cache.
     *
     * @returns {Promise<number>}
     */
    getImageCachedCount: async function() {
      try {
        var cache = await caches.open(IMAGE_CACHE_NAME)
        var keys = await cache.keys()
        return keys.length
      } catch (error) {
        return 0
      }
    },

    /**
     * Delete the whole image cache.
     *
     * @returns {Promise<void>}
     */
    clearImageCache: async function() {
      await caches.delete(IMAGE_CACHE_NAME)
      this.imageCachedCount = 0
      this.imageCacheTotal = null
    }
  }
})
