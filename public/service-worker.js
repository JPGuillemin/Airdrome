// service-worker.optimized.js
// Optimized service worker for Airdrome / Subsonic front-end
// Features:
// - Separate caches for shell, runtime, images
// - Navigation preload for fast SPA nav
// - Stale-while-revalidate for images with LRU trimming
// - Strict exclusion for audio streams and dynamic /rest API endpoints
// - Aggressive cache-first for immutable assets
// - Short-lived runtime caching for some GET responses (optional TTL)

const APP_BASE = '/'
const SW_VERSION = 'v1.0.0'
const SHELL_CACHE = `shell-cache-${SW_VERSION}`
const RUNTIME_CACHE = `runtime-cache-${SW_VERSION}`
const IMAGE_CACHE = `image-cache-${SW_VERSION}`

// App shell resources to pre-cache (keep small)
const APP_SHELL = [
  `${APP_BASE}`,
  `${APP_BASE}index.html`,
  `${APP_BASE}manifest.webmanifest`,
  `${APP_BASE}icon.png`,
]

// Limits
const MAX_IMAGE_ENTRIES = 10000 // adjust to taste
// const RUNTIME_TTL_MS = 1000 * 60 * 15 // 15 minutes for runtime caching if used

// Utility: check origin
function isSameOrigin(url) {
  try {
    return new URL(url, location.href).origin === location.origin
  } catch (e) {
    return false
  }
}

// Useful checks for request URLs
function isSubsonicApi(url) {
  try {
    const u = new URL(url, location.href)
    return u.pathname.includes('/rest/')
  } catch (e) {
    return false
  }
}

function isStreamRequest(url) {
  try {
    const u = new URL(url, location.href)
    return u.pathname.includes('/rest/stream') || u.pathname.includes('/rest/download')
  } catch (e) {
    return false
  }
}

function isImmutableAsset(url) {
  // Heuristic: files in /assets/ or with ?v= or hashed filenames
  try {
    const u = new URL(url, location.href)
    if (u.pathname.startsWith('/assets/') || u.pathname.startsWith('/static/')) return true
    if (u.searchParams.has('v')) return true
    // hashed file pattern: something.[hash].js or .css
    if (/\.[0-9a-f]{8,}\./.test(u.pathname)) return true
    // common immutable extensions
    return /\.(?:js|css|woff2|woff|ttf|png|jpg|svg|webp)$/.test(u.pathname)
  } catch (e) {
    return false
  }
}

// LRU-like trimming for image cache
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const requests = await cache.keys()
  if (requests.length <= maxEntries) return
  const deleteCount = requests.length - maxEntries
  // Cache keys are ordered by insertion in most browsers; delete oldest first
  for (let i = 0; i < deleteCount; i++) {
    await cache.delete(requests[i])
  }
}

// Optionally attach a timestamp to a cached response using Cache Storage Metadata pattern
// (not used heavily here to keep implementation simple)

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(APP_SHELL))
  )
})

self.addEventListener('activate', event => {
  // enable navigation preload to improve TTFB for navigations
  event.waitUntil((async() => {
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable()
    }

    // cleanup old caches
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => ![SHELL_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(k)).map(k => caches.delete(k)))

    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)

  // Only handle GET same-origin requests under APP_BASE
  if (request.method !== 'GET' || !isSameOrigin(url.href) || !url.pathname.startsWith(APP_BASE)) {
    return
  }

  // Exclude sensitive or dynamic API endpoints from caching
  if (isStreamRequest(url.href) || isSubsonicApi(url.href)) {
    // Let network handle streams and API calls (no caching here)
    return
  }

  // SPA navigation
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request, event))
    return
  }

  // Images: stale-while-revalidate with LRU trimming
  if (request.destination === 'image' || /\.(?:png|jpg|jpeg|webp|gif|svg)$/.test(url.pathname)) {
    event.respondWith(cacheImage(request))
    return
  }

  // Immutable assets: cache-first
  if (isImmutableAsset(url.href)) {
    event.respondWith(caches.match(request).then(cached => cached || fetchAndCache(request, SHELL_CACHE)))
    return
  }

  // Fallback: runtime cache with cache-first then network (and store)
  event.respondWith(caches.match(request).then(cached => {
    if (cached) return cached
    return fetchAndCache(request, RUNTIME_CACHE)
  }))
})

// Handle navigation requests: prefer navigation preload -> network -> cache
async function handleNavigation(request, event) {
  try {
    // Try navigation preload if available
    const preloadResponse = await event.preloadResponse
    if (preloadResponse) return preloadResponse

    // Try network with cache fallback
    const networkResponse = await fetch(request)
    // Update shell cache with fresh index.html
    if (networkResponse && networkResponse.type === 'basic' && networkResponse.status === 200) {
      const cache = await caches.open(SHELL_CACHE)
      // store index.html under '/'
      cache.put(`${APP_BASE}index.html`, networkResponse.clone()).catch(() => {})
    }
    return networkResponse
  } catch (err) {
    // network failed — return cached shell
    const cached = await caches.match(`${APP_BASE}index.html`)
    return cached || new Response('Offline', { status: 503, statusText: 'Offline' })
  }
}

// Fetch and cache helper with safe guards
async function fetchAndCache(request, cacheName) {
  try {
    const response = await fetch(request)
    // Only cache successful, same-origin, basic responses
    if (!response || response.status !== 200 || response.type !== 'basic') return response

    const cache = await caches.open(cacheName)
    cache.put(request, response.clone()).catch(() => {})

    // If we wrote an image into the image cache, enforce trimming
    if (cacheName === IMAGE_CACHE) {
      trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES).catch(() => {})
    }

    return response
  } catch (err) {
    // fetch failed — try cache as last resort
    const cached = await caches.match(request)
    if (cached) return cached
    throw err
  }
}

// Specialized image caching: stale-while-revalidate
async function cacheImage(request) {
  const cache = await caches.open(IMAGE_CACHE)
  const cached = await cache.match(request)

  // Kick off a network fetch to update the cache in background
  const fetchPromise = fetch(request).then(response => {
    if (response && response.status === 200 && response.type === 'basic') {
      cache.put(request, response.clone()).catch(() => {})
      // trim in background
      trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES).catch(() => {})
    }
    return response
  }).catch(() => null)

  // Return cached if exists, otherwise wait for network
  if (cached) return cached
  const networkResponse = await fetchPromise
  if (networkResponse) return networkResponse

  // As last fallback, try shell cache icon
  const fallback = await caches.match(`${APP_BASE}icon.png`)
  return fallback || new Response('', { status: 504, statusText: 'Image unavailable' })
}

// Optional: Periodic trimming job if storage grows too fast (uses alarms / periodic sync if supported)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'trim-image-cache') {
    event.waitUntil(trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES))
  }
})

// Optionally respond to messages from the page (e.g., to clear caches)
self.addEventListener('message', event => {
  const { action } = event.data || {}
  if (action === 'CLEAR_RUNTIME_CACHE') {
    event.waitUntil(caches.delete(RUNTIME_CACHE))
  }
  if (action === 'CLEAR_IMAGE_CACHE') {
    event.waitUntil(caches.delete(IMAGE_CACHE))
  }
})

// End of service worker
