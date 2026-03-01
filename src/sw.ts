/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

// =======================================================
// Versioning
// =======================================================

const SW_VERSION = 'v3.1.0'

const RUNTIME_CACHE = `runtime-cache-${SW_VERSION}`
const IMAGE_CACHE = `image-cache-${SW_VERSION}`

const MAX_IMAGE_ENTRIES = 10000
const RUNTIME_TTL_MS = 1000 * 60 * 5

// =======================================================
// Precache (injected by VitePWA)
// =======================================================

precacheAndRoute(self.__WB_MANIFEST)

// SPA fallback handled correctly
const navigationHandler = createHandlerBoundToURL('/index.html')
registerRoute(new NavigationRoute(navigationHandler))

// =======================================================
// Helpers
// =======================================================

function isSameOrigin(url: string) {
  return new URL(url, self.location.href).origin === self.location.origin
}

function isSubsonicApi(url: string) {
  return new URL(url, self.location.href).pathname.includes('/rest/')
}

function isStreamRequest(url: string) {
  const u = new URL(url, self.location.href)
  return (
    u.pathname.includes('/rest/stream') ||
    u.pathname.includes('/rest/download')
  )
}

async function trimCache(cacheName: string, maxEntries: number) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return
  await Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)))
}

// =======================================================
// Fetch handling
// =======================================================

self.addEventListener('fetch', event => {
  const { request } = event

  if (request.method !== 'GET') return
  if (!isSameOrigin(request.url)) return

  const url = new URL(request.url)

  if (isStreamRequest(request.url)) {
    event.respondWith(cacheFirstStream(request))
    return
  }

  if (
    request.destination === 'image' ||
    /\.(png|jpe?g|webp|gif|svg)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirstImage(request))
    return
  }

  if (isSubsonicApi(request.url)) {
    event.respondWith(runtimeCache(request))
    return
  }

  event.respondWith(networkFirst(request))
})

// =======================================================
// Strategies
// =======================================================

async function networkFirst(request: Request) {
  const cache = await caches.open(RUNTIME_CACHE)

  try {
    const response = await fetch(request)
    if (response.status === 200 && response.type === 'basic') {
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await cache.match(request)
    return cached ?? Response.error()
  }
}

async function cacheFirstStream(request: Request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request, { ignoreVary: true })
  if (cached) return cached

  const response = await fetch(request)
  if (response.status === 200) {
    await cache.put(request, response.clone())
  }
  return response
}

async function cacheFirstImage(request: Request) {
  const cache = await caches.open(IMAGE_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.status === 200 && response.type === 'basic') {
      await cache.put(request, response.clone())
      trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES)
    }
    return response
  } catch {
    return Response.error()
  }
}

async function runtimeCache(request: Request) {
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

    if (response.status === 200 && response.type === 'basic') {
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
    return cached ?? Response.error()
  }
}

// =======================================================
// Lifecycle
// =======================================================

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => !k.includes(SW_VERSION))
          .map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// =======================================================
// Manual cache clearing
// =======================================================

self.addEventListener('message', event => {
  const { action } = event.data || {}

  if (action === 'CLEAR_RUNTIME_CACHE') {
    event.waitUntil(caches.delete(RUNTIME_CACHE))
  }

  if (action === 'CLEAR_IMAGE_CACHE') {
    event.waitUntil(caches.delete(IMAGE_CACHE))
  }
})
