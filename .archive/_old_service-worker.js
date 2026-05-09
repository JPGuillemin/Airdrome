/* eslint-env serviceworker */

const APP_BASE = '/'
const SW_VERSION = 'v2.0.0'

const SHELL_CACHE = `shell-cache-${SW_VERSION}`
const RUNTIME_CACHE = `runtime-cache-${SW_VERSION}`
const IMAGE_CACHE = `image-cache-${SW_VERSION}`

const MAX_IMAGE_ENTRIES = 10000
const RUNTIME_TTL_MS = 1000 * 60 * 5

/**
 * IMPORTANT:
 * Replace this list at build-time with your actual build manifest.
 * Must include ALL JS/CSS bundles required to boot the SPA.
 */
const APP_SHELL = [
  `${APP_BASE}`,
  `${APP_BASE}index.html`,
  `${APP_BASE}manifest.webmanifest`,
  `${APP_BASE}icon.png`,
  // Example:
  // `${APP_BASE}assets/index.abc123.js`,
  // `${APP_BASE}assets/index.abc123.css`,
]

/* ----------------------------- URL HELPERS ----------------------------- */

function isSameOrigin (url) {
  try {
    return new URL(url, self.location.href).origin === self.location.origin
  } catch {
    return false
  }
}

function isSubsonicApi (url) {
  try {
    return new URL(url, self.location.href).pathname.includes('/rest/')
  } catch {
    return false
  }
}

function isStreamRequest (url) {
  try {
    const u = new URL(url, self.location.href)
    return (
      u.pathname.includes('/rest/stream') ||
      u.pathname.includes('/rest/download')
    )
  } catch {
    return false
  }
}

function isImmutableAsset (url) {
  try {
    const u = new URL(url, self.location.href)
    if (u.pathname.startsWith('/assets/')) return true
    if (u.searchParams.has('v')) return true
    if (/\.[0-9a-f]{8,}\./.test(u.pathname)) return true
    return /\.(js|css|woff2?|ttf)$/.test(u.pathname)
  } catch {
    return false
  }
}

/* ----------------------------- INSTALL ----------------------------- */

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      await cache.addAll(APP_SHELL)
      await self.skipWaiting()
    })()
  )
})

/* ----------------------------- ACTIVATE ----------------------------- */

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter(k => ![SHELL_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(k))
          .map(k => caches.delete(k))
      )

      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable()
      }

      await self.clients.claim()
    })()
  )
})

/* ----------------------------- FETCH ----------------------------- */

self.addEventListener('fetch', event => {
  const { request } = event

  if (request.method !== 'GET') return
  if (!isSameOrigin(request.url)) return

  const url = new URL(request.url)

  // Audio streams → strict cache-first
  if (isStreamRequest(request.url)) {
    event.respondWith(cacheFirstStream(request))
    return
  }

  // Navigation → strict cache-first (NO network dependency)
  if (request.mode === 'navigate') {
    event.respondWith(cacheFirstNavigation())
    return
  }

  // Images → strict cache-first
  if (
    request.destination === 'image' ||
    /\.(png|jpe?g|webp|gif|svg)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirstImage(request))
    return
  }

  // Immutable bundles → strict cache-first
  if (isImmutableAsset(request.url)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE))
    return
  }

  // API GET → cache-first with TTL
  if (isSubsonicApi(request.url)) {
    event.respondWith(runtimeCache(request))
    return
  }

  // Fallback
  event.respondWith(cacheFirst(request, RUNTIME_CACHE))
})

/* ----------------------------- NAVIGATION ----------------------------- */

async function cacheFirstNavigation () {
  const cache = await caches.open(SHELL_CACHE)
  const cached = await cache.match(`${APP_BASE}index.html`)
  if (cached) return cached
  return new Response('Offline', { status: 503 })
}

/* ----------------------------- GENERIC CACHE FIRST ----------------------------- */

async function cacheFirst (request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response && response.status === 200 && response.type === 'basic') {
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Offline', { status: 503 })
  }
}

/* ----------------------------- STREAM CACHE ----------------------------- */

async function cacheFirstStream (request) {
  const cache = await caches.open(RUNTIME_CACHE)

  const cached = await cache.match(request, { ignoreVary: true })
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response && response.status === 200) {
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Offline', { status: 503 })
  }
}

/* ----------------------------- IMAGE CACHE ----------------------------- */

async function cacheFirstImage (request) {
  const cache = await caches.open(IMAGE_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response && response.status === 200 && response.type === 'basic') {
      await cache.put(request, response.clone())
      trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES).catch(() => {})
    }
    return response
  } catch {
    const fallback = await caches.match(`${APP_BASE}icon.png`)
    return fallback || new Response('', { status: 504 })
  }
}

/* ----------------------------- API CACHE WITH TTL ----------------------------- */

async function runtimeCache (request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request)

  if (cached) {
    const ts = cached.headers.get('sw-cache-date')
    if (ts && Date.now() - Number(ts) < RUNTIME_TTL_MS) {
      return cached
    }
  }

  try {
    const response = await fetch(request)
    if (response && response.status === 200 && response.type === 'basic') {
      const headers = new Headers(response.headers)
      headers.set('sw-cache-date', Date.now().toString())

      const body = await response.clone().blob()
      const cachedResponse = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })

      await cache.put(request, cachedResponse)
    }
    return response
  } catch {
    return cached || new Response('Offline', { status: 503 })
  }
}

/* ----------------------------- LRU TRIM ----------------------------- */

async function trimCache (cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return

  const excess = keys.length - maxEntries
  await Promise.all(keys.slice(0, excess).map(k => cache.delete(k)))
}

/* ----------------------------- MESSAGE API ----------------------------- */

self.addEventListener('message', event => {
  const { action } = event.data || {}

  if (action === 'CLEAR_RUNTIME_CACHE') {
    event.waitUntil(caches.delete(RUNTIME_CACHE))
  }

  if (action === 'CLEAR_IMAGE_CACHE') {
    event.waitUntil(caches.delete(IMAGE_CACHE))
  }
})
