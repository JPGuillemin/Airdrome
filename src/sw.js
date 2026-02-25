/// <reference lib="webworker" />
/* eslint-env serviceworker */

import { precacheAndRoute } from 'workbox-precaching'

// -----------------------------------------------------------
// Precache all Vite build assets (injected at build time)
// -----------------------------------------------------------
precacheAndRoute(self.__WB_MANIFEST)

// -----------------------------------------------------------
// Versioned caches for runtime data
// -----------------------------------------------------------
const SW_VERSION = 'v2.0.0'
const SHELL_CACHE = `shell-cache-${SW_VERSION}`
const RUNTIME_CACHE = `runtime-cache-${SW_VERSION}`
const IMAGE_CACHE = `image-cache-${SW_VERSION}`

const MAX_IMAGE_ENTRIES = 10000
const RUNTIME_TTL_MS = 1000 * 60 * 5 // 5 min for API GET caching

// ---------------- URL helpers ----------------
function isSameOrigin(url) {
  try { return new URL(url, self.location.href).origin === self.location.origin } catch { return false }
}
function isSubsonicApi(url) {
  try { return new URL(url, self.location.href).pathname.includes('/rest/') } catch { return false }
}
function isStreamRequest(url) {
  try {
    const u = new URL(url, self.location.href)
    return u.pathname.includes('/rest/stream') || u.pathname.includes('/rest/download')
  } catch { return false }
}

// ---------------- LRU trim ----------------
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return
  const excess = keys.length - maxEntries
  await Promise.all(keys.slice(0, excess).map(k => cache.delete(k)))
}

// ---------------- Fetch handler ----------------
self.addEventListener('fetch', event => {
  const { request } = event

  if (request.method !== 'GET') return
  if (!isSameOrigin(request.url)) return

  const url = new URL(request.url)

  // Audio streams → cache-first (range-friendly)
  if (isStreamRequest(request.url)) {
    event.respondWith(cacheFirstStream(request))
    return
  }

  // SPA navigation → cache-first
  if (request.mode === 'navigate') {
    event.respondWith(cacheFirstNavigation())
    return
  }

  // Images → cache-first + LRU
  if (request.destination === 'image' || /\.(png|jpe?g|webp|gif|svg)$/.test(url.pathname)) {
    event.respondWith(cacheFirstImage(request))
    return
  }

  // API GET → runtime cache with TTL
  if (isSubsonicApi(request.url)) {
    event.respondWith(runtimeCache(request))
    return
  }

  // Fallback → runtime cache
  event.respondWith(cacheFirst(request, RUNTIME_CACHE))
})

// ---------------- Navigation handler ----------------
async function cacheFirstNavigation() {
  const cache = await caches.open(SHELL_CACHE)
  const cached = await cache.match('/index.html')
  if (cached) return cached
  return new Response('Offline', { status: 503 })
}

// ---------------- Generic cache-first ----------------
async function cacheFirst(request, cacheName) {
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

// ---------------- Audio stream cache ----------------
async function cacheFirstStream(request) {
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

// ---------------- Image cache ----------------
async function cacheFirstImage(request) {
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
    const fallback = await caches.match('/icon.png')
    return fallback || new Response('', { status: 504, statusText: 'Image unavailable' })
  }
}

// ---------------- Runtime API cache with TTL ----------------
async function runtimeCache(request) {
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
      const cachedResp = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
      await cache.put(request, cachedResp)
    }
    return response
  } catch {
    return cached || new Response('Offline', { status: 503 })
  }
}

// ---------------- Message listener for cache clearing ----------------
self.addEventListener('message', event => {
  const { action } = event.data || {}
  if (action === 'CLEAR_RUNTIME_CACHE') event.waitUntil(caches.delete(RUNTIME_CACHE))
  if (action === 'CLEAR_IMAGE_CACHE') event.waitUntil(caches.delete(IMAGE_CACHE))
})
