const APP_BASE = '/'
const SW_VERSION = 'v1.2.1'
const SHELL_CACHE = `shell-cache-${SW_VERSION}`
const RUNTIME_CACHE = `runtime-cache-${SW_VERSION}`
const IMAGE_CACHE = `image-cache-${SW_VERSION}`

const APP_SHELL = [
  `${APP_BASE}`,
  `${APP_BASE}index.html`,
  `${APP_BASE}manifest.webmanifest`,
  `${APP_BASE}icon.png`,
]

const MAX_IMAGE_ENTRIES = 10000
const RUNTIME_TTL_MS = 1000 * 60 * 5 // 5 minutes for API GET caching

// --- URL helpers ---
function isSameOrigin(url) {
  try { return new URL(url, location.href).origin === location.origin } catch { return false }
}
function isSubsonicApi(url) {
  try { return new URL(url, location.href).pathname.includes('/rest/') } catch { return false }
}
function isStreamRequest(url) {
  try {
    const u = new URL(url, location.href)
    return u.pathname.includes('/rest/stream') || u.pathname.includes('/rest/download')
  } catch { return false }
}
function isImmutableAsset(url) {
  try {
    const u = new URL(url, location.href)
    if (u.pathname.startsWith('/assets/') || u.pathname.startsWith('/static/')) return true
    if (u.searchParams.has('v')) return true
    if (/\.[0-9a-f]{8,}\./.test(u.pathname)) return true
    return /\.(?:js|css|woff2|woff|ttf|png|jpg|svg|webp)$/.test(u.pathname)
  } catch { return false }
}

// --- LRU trimming for image cache ---
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return
  for (let i = 0; i < keys.length - maxEntries; i++) {
    await cache.delete(keys[i])
  }
}

// --- Install / pre-cache app shell ---
self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(APP_SHELL)))
})

// --- Activate / cleanup old caches ---
self.addEventListener('activate', event => {
  event.waitUntil((async() => {
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => ![SHELL_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(k)).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

// --- Fetch handler ---
self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== 'GET' || !isSameOrigin(url.href) || !url.pathname.startsWith(APP_BASE)) return

  // Audio stream/download → cache-first (preserves range requests)
  if (isStreamRequest(url.href)) {
    event.respondWith(cacheFirstStream(request))
    return
  }

  // SPA navigation: cache-first shell
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request, event))
    return
  }

  // Images: stale-while-revalidate
  if (request.destination === 'image' || /\.(?:png|jpg|jpeg|webp|gif|svg)$/.test(url.pathname)) {
    event.respondWith(cacheImage(request))
    return
  }

  // Immutable assets: cache-first
  if (isImmutableAsset(url.href)) {
    event.respondWith(caches.match(request).then(cached => cached || fetchAndCache(request, SHELL_CACHE)))
    return
  }

  // Runtime caching for API GETs
  if (isSubsonicApi(url.href) && request.method === 'GET') {
    event.respondWith(runtimeCache(request))
    return
  }

  // Fallback: runtime cache
  event.respondWith(caches.match(request).then(cached => cached || fetchAndCache(request, RUNTIME_CACHE)))
})

// --- Navigation: cache-first, background update ---
async function handleNavigation(request, event) {
  const cache = await caches.open(SHELL_CACHE)
  const cached = await cache.match(`${APP_BASE}index.html`)
  if (cached) {
    // Background update
    event.waitUntil(fetch(request).then(resp => {
      if (resp && resp.status === 200 && resp.type === 'basic') {
        cache.put(`${APP_BASE}index.html`, resp.clone()).catch(() => {})
      }
    }).catch(() => {}))
    return cached
  }

  // Fallback to network
  try {
    const networkResponse = await fetch(request)
    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
      cache.put(`${APP_BASE}index.html`, networkResponse.clone()).catch(() => {})
    }
    return networkResponse
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Offline' })
  }
}

async function cacheFirstStream(request) {
  const cache = await caches.open(RUNTIME_CACHE)

  // IMPORTANT: match ignoring Range header differences
  const cached = await cache.match(request, { ignoreVary: true })

  if (cached) {
    return cached
  }

  try {
    const response = await fetch(request)

    // Only cache full responses (not partial 206)
    if (response && response.status === 200) {
      cache.put(request, response.clone()).catch(() => {})
    }

    return response
  } catch {
    if (cached) return cached
    return new Response('Offline', { status: 503 })
  }
}

// --- Runtime API cache with TTL ---
async function runtimeCache(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request)

  if (cached) {
    const dateHeader = cached.headers.get('sw-cache-date')
    if (dateHeader && (Date.now() - parseInt(dateHeader, 10)) < RUNTIME_TTL_MS) {
      return cached
    }
  }

  try {
    const response = await fetch(request)
    if (response && response.status === 200 && response.type === 'basic') {
      const headers = new Headers(response.headers)
      headers.set('sw-cache-date', Date.now().toString())
      const respClone = new Response(await response.clone().blob(), {
        status: response.status,
        statusText: response.statusText,
        headers
      })
      cache.put(request, respClone).catch(() => {})
    }
    return response
  } catch {
    return cached || new Response('Offline', { status: 503, statusText: 'Offline' })
  }
}

// --- Fetch and cache helper ---
async function fetchAndCache(request, cacheName) {
  try {
    const response = await fetch(request)
    if (!response || response.status !== 200 || response.type !== 'basic') return response
    const cache = await caches.open(cacheName)
    cache.put(request, response.clone()).catch(() => {})
    if (cacheName === IMAGE_CACHE) trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES).catch(() => {})
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    throw new Error('Network failed')
  }
}

// --- Image cache: stale-while-revalidate ---
async function cacheImage(request) {
  const cache = await caches.open(IMAGE_CACHE)
  const cached = await cache.match(request)

  const fetchPromise = fetch(request).then(resp => {
    if (resp && resp.status === 200 && resp.type === 'basic') {
      cache.put(request, resp.clone()).catch(() => {})
      trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES).catch(() => {})
    }
    return resp
  }).catch(() => null)

  if (cached) return cached
  const networkResponse = await fetchPromise
  if (networkResponse) return networkResponse
  return caches.match(`${APP_BASE}icon.png`) || new Response('', { status: 504, statusText: 'Image unavailable' })
}

// --- Message handler to clear caches ---
self.addEventListener('message', event => {
  const { action } = event.data || {}
  if (action === 'CLEAR_RUNTIME_CACHE') event.waitUntil(caches.delete(RUNTIME_CACHE))
  if (action === 'CLEAR_IMAGE_CACHE') event.waitUntil(caches.delete(IMAGE_CACHE))
})
