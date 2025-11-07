const APP_BASE = '/'
const CACHE_NAME = 'airdrome-cache-v7'
const APP_SHELL = [
  `${APP_BASE}`, // main entry (index.html will be cached)
  `${APP_BASE}index.html`,
  `${APP_BASE}manifest.webmanifest`,
  `${APP_BASE}icon.png`
]

// Install: pre-cache the core app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

// Activate: remove old caches and take control immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    (async() => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

// Fetch: handle requests for APP_BASE
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle GET requests from same origin and under /airdrome/
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(APP_BASE)
  ) {
    return
  }

  // Handle SPA navigation (Vue Router)
  if (request.mode === 'navigate') {
    // Fetch a fresh index.html, fallback to cache if offline
    event.respondWith(
      fetch(`${APP_BASE}index.html`, { cache: 'reload' })
        .then(response => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(`${APP_BASE}index.html`, copy))
          return response
        })
        .catch(() => caches.match(`${APP_BASE}index.html`))
    )
    return
  }

  // Cache-first strategy for static assets and API responses
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        const copy = response.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy))
        return response
      })
    })
  )
})
