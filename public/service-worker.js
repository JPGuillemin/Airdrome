const CACHE_NAME = 'airdrome-cache-v1'
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.png'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse

      return fetch(request).then((response) => {
        if (response && response.status === 200) {
          const url = new URL(request.url)
          if (
            url.pathname.startsWith('/assets/') &&
            (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))
          ) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
          }
        }
        return response
      })
    })
  )
})
