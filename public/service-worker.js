const APP_BASE = '/'
const SW_VERSION = 'v1.2.0'

// Cache names
const SHELL_CACHE = `shell-${SW_VERSION}`
const RUNTIME_CACHE = `runtime-${SW_VERSION}`
const IMAGE_CACHE = `images-${SW_VERSION}`
const AUDIO_CACHE = 'airdrome-cache-v2'

// Limits
const MAX_IMAGE_ENTRIES = 10000

// App shell
const APP_SHELL = [
  `${APP_BASE}`,
  `${APP_BASE}index.html`,
  `${APP_BASE}manifest.webmanifest`,
  `${APP_BASE}icon.png`,
]

/* -------------------------------------------------- */
/* INSTALL */
/* -------------------------------------------------- */

self.addEventListener('install', event => {

  self.skipWaiting()

  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
  )

})

/* -------------------------------------------------- */
/* ACTIVATE */
/* -------------------------------------------------- */

self.addEventListener('activate', event => {

  event.waitUntil((async () => {

    const keys = await caches.keys()

    const allowed = [
      SHELL_CACHE,
      RUNTIME_CACHE,
      IMAGE_CACHE,
      AUDIO_CACHE
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
/* FETCH */
/* -------------------------------------------------- */

self.addEventListener('fetch', event => {

  const request = event.request
  const url = new URL(request.url)

  if (request.method !== 'GET') return

  /* SPA navigation */

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE))
    return
  }

  /* AUDIO STREAMS */

  if (
    url.pathname.includes('/rest/stream') ||
    url.pathname.includes('/rest/download')
  ) {
    event.respondWith(audioStrategy(request))
    return
  }

  /* IMAGES */

  if (
    request.destination === 'image' ||
    /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(url.pathname)
  ) {
    event.respondWith(imageStrategy(request))
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
/* AUDIO STRATEGY */
/* Network first / Cache fallback */
/* -------------------------------------------------- */

async function audioStrategy(request) {

  // Do not cache range requests
  if (request.headers.has('range')) {
    return fetch(request)
  }

  const cache = await caches.open(AUDIO_CACHE)

  try {

    const response = await fetch(request)

    if (response && response.status === 200) {

      const cached = await cache.match(request)

      // Avoid overwriting entries managed by the app
      if (!cached) {
        cache.put(request, response.clone()).catch(() => {})
      }

    }

    return response

  } catch (err) {

    const cached = await cache.match(request)

    if (cached) return cached

    throw err
  }

}

/* -------------------------------------------------- */
/* IMAGE STRATEGY */
/* Cache first + background update */
/* -------------------------------------------------- */

async function imageStrategy(request) {

  const cache = await caches.open(IMAGE_CACHE)
  const cached = await cache.match(request)

  const networkFetch = fetch(request)
    .then(async response => {

      if (response && response.status === 200) {

        await cache.put(request, response.clone())
        trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES)

      }

      return response

    })
    .catch(() => null)

  if (cached) return cached

  const network = await networkFetch

  if (network) return network

  return new Response('', { status: 504 })

}

/* -------------------------------------------------- */
/* NETWORK FIRST */
/* -------------------------------------------------- */

async function networkFirst(request, cacheName) {

  const cache = await caches.open(cacheName)

  try {

    const response = await fetch(request)

    if (response && response.status === 200) {
      cache.put(request, response.clone()).catch(() => {})
    }

    return response

  } catch {

    const cached = await cache.match(request)

    if (cached) return cached

    throw err
  }

}

/* -------------------------------------------------- */
/* CACHE FIRST */
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
/* HELPERS */
/* -------------------------------------------------- */

function isStaticAsset(path) {
  return /\.(js|css|woff2?|ttf|png|jpg|svg|webp)$/i.test(path)
}

async function trimCache(cacheName, maxEntries) {

  const cache = await caches.open(cacheName)
  const keys = await cache.keys()

  if (keys.length <= maxEntries) return

  const deleteCount = keys.length - maxEntries

  for (let i = 0; i < deleteCount; i++) {
    await cache.delete(keys[i])
  }

}

/* -------------------------------------------------- */
/* MESSAGES */
/* -------------------------------------------------- */

self.addEventListener('message', event => {

  const { action } = event.data || {}

  if (action === 'CLEAR_RUNTIME_CACHE') {
    event.waitUntil(caches.delete(RUNTIME_CACHE))
  }

  if (action === 'CLEAR_IMAGE_CACHE') {
    event.waitUntil(caches.delete(IMAGE_CACHE))
  }

  if (action === 'CLEAR_AUDIO_CACHE') {
    event.waitUntil(caches.delete(AUDIO_CACHE))
  }

})
