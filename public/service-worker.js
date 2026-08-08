// service-worker.js

const APP_BASE = '/'

// ─── Cache names ──────────────────────────────────────────────────────────────
// Bump SHELL_CACHE on every build so stale shells are
// replaced automatically on next SW activation.
const SHELL_CACHE = `shell-cache-${__BUILD_VERSION__}`
const RUNTIME_CACHE = 'runtime-cache-v1'
const IMAGE_CACHE   = 'images-cache-v1'

// Audio is deliberately NOT cached here. The app (src/shared/cache.ts) owns
// audio persistence explicitly — Filesystem on native, Cache API on web —
// with its own LRU/size accounting. If the SW also opportunistically cached
// every /rest/stream response, both systems would write to the same bytes
// without knowing about each other: cache.ts's size accounting would silently
// undercount real disk usage, and tracks the user never asked to keep offline
// would show up as "cached" in the UI. One owner for audio persistence.

// Limits
const MAX_IMAGE_ENTRIES = 10000
// Trimming is checked probabilistically rather than on every write — an
// exact key-count walk (`cache.keys()`) over up to MAX_IMAGE_ENTRIES items
// is real work to do on every single image write. Being off by a few dozen
// entries between checks costs nothing; doing a full keys() scan on every
// cache.put() does.
const TRIM_CHECK_PROBABILITY = 1 / 20

// ─── App shell ────────────────────────────────────────────────────────────────
// self.__WB_MANIFEST is replaced at build time by vite-plugin-pwa with the
// full list of hashed assets emitted by Vite (JS, CSS, HTML, icons, etc.).
// Do NOT edit this manually — control what is included via globPatterns in
// the VitePWA() config in vite.config.mjs.
//
// The ?? [] fallback keeps the SW valid during local dev (no injection step).
const WB_MANIFEST = self.__WB_MANIFEST ?? []

/* -------------------------------------------------- */
/* INSTALL                                            */
/* -------------------------------------------------- */

self.addEventListener('install', event => {

  self.skipWaiting()

  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      // Use allSettled so a single 404 does not abort the whole install.
      // Each URL is added individually; failures are logged but do not
      // prevent the SW from activating and serving whatever was cached
      // successfully.
      Promise.allSettled(
        WB_MANIFEST.map(({ url }) =>
          cache.add(url).catch(err =>
            console.warn(`[SW] Failed to precache: ${url}`, err)
          )
        )
      )
    )
  )

})

/* -------------------------------------------------- */
/* ACTIVATE                                           */
/* -------------------------------------------------- */

self.addEventListener('activate', event => {

  event.waitUntil((async () => {

    const keys = await caches.keys()

    const allowed = [
      SHELL_CACHE,
      RUNTIME_CACHE,
      IMAGE_CACHE,
    ]

    await Promise.all(
      keys
        .filter(key => !allowed.includes(key))
        .map(key => caches.delete(key))
    )

    await self.clients.claim()

  })())

})

/* -------------------------------------------------- */
/* FETCH                                              */
/* -------------------------------------------------- */

self.addEventListener('fetch', event => {

  const request = event.request
  const url = new URL(request.url)

  if (request.method !== 'GET') return

  /* SPA navigation */

  if (request.mode === 'navigate') {
    // Always fall back to the cached index.html when the network is
    // unavailable so the SPA can boot and handle routing offline.
    event.respondWith(
      networkFirst(request, SHELL_CACHE).catch(() =>
        caches.match(`${APP_BASE}index.html`)
      )
    )
    return
  }

  /* AUDIO STREAMS — deliberately pass-through, see note above */

  if (
    url.pathname.includes('/rest/stream') ||
    url.pathname.includes('/rest/download')
  ) {
    return // let the browser handle it natively; no event.respondWith()
  }

  /* IMAGES + COVER ART */

  const isCoverArt =
    url.pathname.includes('/rest/getCoverArt')

  // Restrict the image strategy to cover-art API calls and cross-origin
  // images only. Same-origin image assets (bundled SVGs, PNGs, etc.) fall
  // through to the static-asset handler below so they are served from
  // SHELL_CACHE where they were precached at install time.
  const isExternalImage =
    url.origin !== self.location.origin &&
    (
      request.destination === 'image' ||
      /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(url.pathname)
    )

  if (isCoverArt || isExternalImage) {
    event.respondWith(imageStrategy(request))
    return
  }

  /* LIBRARY */

  const isGenres   = url.pathname.includes('/rest/getGenre')
  const isArtists  = url.pathname.includes('/rest/getArtist')
  const isAlbums   = url.pathname.includes('/rest/getAlbum')
  const isPlaylist = url.pathname.includes('/rest/getPlaylist')

  if (isGenres || isArtists || isAlbums || isPlaylist) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE))
    return
  }

  /* STATIC ASSETS */

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE))
    return
  }

  /* DEFAULT */

  event.respondWith(networkFirst(request, RUNTIME_CACHE))

})

/* -------------------------------------------------- */
/* IMAGE STRATEGY                                     */
/* Cache first + background update                    */
/* -------------------------------------------------- */

async function imageStrategy(request) {

  const cache = await caches.open(IMAGE_CACHE)

  const cached = await cache.match(request)

  // Return cached immediately
  if (cached) {

    // Background refresh
    fetch(request)
      .then(async response => {

        if (response && response.ok) {

          await cache.put(request, response.clone())
          maybeTrimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES)

        }

      })
      .catch(() => {})

    return cached
  }

  try {

    const response = await fetch(request)

    if (response && response.ok) {

      await cache.put(request, response.clone())
      maybeTrimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES)

    }

    return response

  } catch {

    return new Response('', { status: 504 })

  }

}

/* -------------------------------------------------- */
/* NETWORK FIRST                                      */
/* -------------------------------------------------- */

async function networkFirst(request, cacheName) {

  const cache = await caches.open(cacheName)

  try {

    const response = await fetch(request)

    if (response && response.status === 200) {
      cache.put(request, response.clone()).catch(() => {})
    }

    return response

  } catch (err) {

    const cached = await cache.match(request)

    if (cached) return cached

    throw err
  }

}

/* -------------------------------------------------- */
/* CACHE FIRST                                        */
/* -------------------------------------------------- */

async function cacheFirst(request, cacheName) {

  const cache = await caches.open(cacheName)

  const cached = await cache.match(request)

  if (cached) return cached

  const response = await fetch(request)

  if (response && response.status === 200) {
    cache.put(request, response.clone()).catch(() => {})
  }

  return response

}

/* -------------------------------------------------- */
/* HELPERS                                            */
/* -------------------------------------------------- */

function isStaticAsset(path) {
  return /\.(js|css|woff2?|ttf|png|jpg|svg|webp)$/i.test(path)
}

/**
 * Trim a cache down to maxEntries, but only bother checking on a random
 * fraction of calls (TRIM_CHECK_PROBABILITY). A full cache.keys() walk is
 * O(n) in stored entries — running it on every single write when the cache
 * can hold up to 10k entries is wasted work almost every time, since going
 * a little over the limit between checks is harmless.
 */
async function maybeTrimCache(cacheName, maxEntries) {

  if (Math.random() > TRIM_CHECK_PROBABILITY) return

  const cache = await caches.open(cacheName)
  const keys  = await cache.keys()

  if (keys.length <= maxEntries) return

  const deleteCount = keys.length - maxEntries

  for (let i = 0; i < deleteCount; i++) {
    await cache.delete(keys[i])
  }

}

/* -------------------------------------------------- */
/* MESSAGES                                           */
/* -------------------------------------------------- */

self.addEventListener('message', event => {

  const { action } = event.data || {}

  if (action === 'CLEAR_RUNTIME_CACHE') {
    event.waitUntil(caches.delete(RUNTIME_CACHE))
  }

  if (action === 'CLEAR_IMAGE_CACHE') {
    event.waitUntil(caches.delete(IMAGE_CACHE))
  }

})
