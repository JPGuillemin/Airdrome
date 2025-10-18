const CACHE_NAME = 'airdrome-cache-v2' // Incremented version
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.png',
  '/offline.html' // Optional offline fallback page
]
const MAX_DYNAMIC_CACHE_ITEMS = 50 // Optional limit for runtime cache

// Helper: limit cache size
async function limitCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length > maxItems) {
    await cache.delete(keys[0])
    await limitCacheSize(cacheName, maxItems) // Recursive removal
  }
}

// Install event: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

// Activate event: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  )
})

// Fetch event: cache-first for app shell, runtime caching for assets
self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
    return // Ignore non-GET or cross-origin requests
  }

  event.respondWith(
    (async() => {
      // Check cache first
      const cachedResponse = await caches.match(request)
      if (cachedResponse) return cachedResponse

      try {
        // Fetch from network
        const response = await fetch(request)

        // Runtime cache JS/CSS assets in /assets/
        const url = new URL(request.url)
        if (
          url.pathname.startsWith('/assets/') &&
          (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) &&
          response.status === 200
        ) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(request, response.clone())
          await limitCacheSize(CACHE_NAME, MAX_DYNAMIC_CACHE_ITEMS)
        }

        return response
      } catch (err) {
        // Offline fallback
        const fallback = await caches.match('/offline.html')
        return fallback || new Response('You are offline.', { status: 503, statusText: 'Offline' })
      }
    })()
  )
})
