const CACHE_NAME = 'airdrome-cache-v5'
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.png'
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || !url.origin.startsWith(self.location.origin)) return

  // Handle SPA navigations
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(cached =>
        cached || fetch('/index.html')
      )
    )
    return
  }

  // Handle static assets with cache-first
  event.respondWith(
    caches.match(request).then(cached =>
      cached ||
      fetch(request).then(response => {
        const copy = response.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy))
        return response
      })
    )
  )
})
