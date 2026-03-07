const APP_BASE = '/'
const SW_VERSION = 'v1.1.0'

const SHELL_CACHE = `shell-cache-${SW_VERSION}`
const RUNTIME_CACHE = `runtime-cache-${SW_VERSION}`
const IMAGE_CACHE = `image-cache-${SW_VERSION}`
const AUDIO_CACHE = 'airdrome-cache-v2'

const APP_SHELL = [
  `${APP_BASE}`,
  `${APP_BASE}index.html`,
  `${APP_BASE}manifest.webmanifest`,
  `${APP_BASE}icon.png`,
]

const MAX_IMAGE_ENTRIES = 10000

// --------------------------------------------------
// Install
// --------------------------------------------------

self.addEventListener('install', event => {
  self.skipWaiting()

  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(APP_SHELL))
  )
})

// --------------------------------------------------
// Activate
// --------------------------------------------------

self.addEventListener('activate', event => {
  event.waitUntil((async() => {

    const keys = await caches.keys()

    await Promise.all(
      keys.filter(k =>
        ![SHELL_CACHE, RUNTIME_CACHE, IMAGE_CACHE, AUDIO_CACHE].includes(k)
      ).map(k => caches.delete(k))
    )

    await self.clients.claim()

  })())
})

// --------------------------------------------------
// Fetch
// --------------------------------------------------

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== 'GET') return

  // SPA navigation
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE))
    return
  }

  // Audio streams (Subsonic)
  if (url.pathname.includes('/rest/stream') || url.pathname.includes('/rest/download')) {
    event.respondWith(networkFirst(request, AUDIO_CACHE))
    return
  }

  // Images
  if (request.destination === 'image' || /\.(png|jpg|jpeg|webp|gif|svg)$/.test(url.pathname)) {
    event.respondWith(imageStrategy(request))
    return
  }

  // Static assets
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE))
    return
  }

  // Default
  event.respondWith(networkFirst(request, RUNTIME_CACHE))
})

// --------------------------------------------------
// Strategies
// --------------------------------------------------

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

async function imageStrategy(request) {

  const cache = await caches.open(IMAGE_CACHE)
  const cached = await cache.match(request)

  const networkFetch = fetch(request).then(async response => {

    if (response && response.status === 200) {
      await cache.put(request, response.clone())
      trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES)
    }

    return response

  }).catch(() => null)

  if (cached) return cached

  const network = await networkFetch
  if (network) return network

  return new Response('', { status: 504 })
}

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function isStaticAsset(path) {
  return /\.(js|css|woff2|woff|ttf|png|jpg|svg|webp)$/.test(path)
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

// --------------------------------------------------
// Messages
// --------------------------------------------------

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

