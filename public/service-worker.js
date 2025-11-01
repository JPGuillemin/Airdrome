// === CONFIGURATION ===
const CACHE_NAME = 'airdrome-cache-v4' // Increment version when updating
const API_CACHE = 'api-cache-v1'
const MAX_DYNAMIC_CACHE_ITEMS = 50

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.png'
]

// === HELPERS ===
async function limitCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length > maxItems) {
    await cache.delete(keys[0])
    await limitCacheSize(cacheName, maxItems)
  }
}

// === INSTALL: precache app shell ===
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

// === ACTIVATE: clean old caches + notify clients ===
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async() => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => ![CACHE_NAME, API_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
      // Claim all clients
      await self.clients.claim()

      // Notify clients that an update is ready
      const clientsList = await self.clients.matchAll({ type: 'window' })
      for (const client of clientsList) {
        client.postMessage({ type: 'UPDATE_READY' })
      }
    })()
  )
})

// === FETCH: intelligent caching strategies ===
self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  event.respondWith(
    (async() => {
      // APP SHELL: cache-first
      if (APP_SHELL.includes(url.pathname)) {
        const cached = await caches.match(request)
        if (cached) return cached
        try {
          const response = await fetch(request)
          const cache = await caches.open(CACHE_NAME)
          cache.put(request, response.clone())
          return response
        } catch {}
      }

      // STATIC ASSETS: stale-while-revalidate
      if (url.pathname.startsWith('/assets/') &&
          (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
        const cache = await caches.open(CACHE_NAME)
        const cachedResponse = await cache.match(request)

        // Fetch in background (2s timeout for reactivity)
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 2000)
        const networkPromise = fetch(request, { signal: controller.signal })
          .then((res) => {
            clearTimeout(timeout)
            if (res.status === 200) {
              cache.put(request, res.clone())
              limitCacheSize(CACHE_NAME, MAX_DYNAMIC_CACHE_ITEMS)
            }
            return res
          })
          .catch(() => null)

        return cachedResponse || networkPromise || caches.match('/offline.html')
      }

      // API CALLS: network-first with cache fallback
      if (url.pathname.startsWith('/api/')) {
        const cache = await caches.open(API_CACHE)
        try {
          const networkResponse = await fetch(request)
          if (networkResponse.ok) cache.put(request, networkResponse.clone())
          return networkResponse
        } catch {
          const cached = await cache.match(request)
          return cached || new Response('Offline API cache empty', { status: 503 })
        }
      }

      // IMAGES: cache-first (limit size)
      if (url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) {
        const cache = await caches.open('image-cache-v1')
        const cached = await cache.match(request)
        if (cached) return cached
        try {
          const response = await fetch(request)
          if (response.status === 200) {
            cache.put(request, response.clone())
            limitCacheSize('image-cache-v1', 30)
          }
          return response
        } catch {}
      }

      // FALLBACK: default network-first
      try {
        return await fetch(request)
      } catch {
        const cached = await caches.match(request)
        if (!url.pathname.match(/\.[a-zA-Z0-9]+$/)) {
          return caches.match('/index.html')
        }
        return cached
      }
    })()
  )
})
