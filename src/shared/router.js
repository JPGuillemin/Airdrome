// router.js
//
// Vue Router setup: lazy route components, scroll restoration and the
// authentication guard. Written in an explicit, ES5-friendly style: var,
// function expressions and string concatenation.

import { createRouter, createWebHistory } from 'vue-router'
import { nextTick } from 'vue'

/**
 * @typedef {import('@/auth/service').AuthService} AuthService
 */

// Lazily load route components so the initial bundle stays small.
var Login = function() {
  return import('@/auth/Login.vue')
}

var Queue = function() {
  return import('@/player/Queue.vue')
}

var Discover = function() {
  return import('@/discover/Discover.vue')
}

var ArtistDetails = function() {
  return import('@/library/artist/ArtistDetails.vue')
}

var ArtistLibrary = function() {
  return import('@/library/artist/ArtistLibrary.vue')
}

var AlbumDetails = function() {
  return import('@/library/album/AlbumDetails.vue')
}

var AlbumLibrary = function() {
  return import('@/library/album/AlbumLibrary.vue')
}

var GenreDetails = function() {
  return import('@/library/genre/GenreDetails.vue')
}

var GenreLibrary = function() {
  return import('@/library/genre/GenreLibrary.vue')
}

var Favourites = function() {
  return import('@/library/favourite/Favourites.vue')
}

var Playlist = function() {
  return import('@/library/playlist/Playlist.vue')
}

var PlaylistLibrary = function() {
  return import('@/library/playlist/PlaylistLibrary.vue')
}

var SearchResult = function() {
  return import('@/library/search/SearchResult.vue')
}

var APP_BASE = import.meta.env.BASE_URL

var routerInstance = null

/**
 * Router singleton for modules that cannot use useRouter() (e.g. stores).
 *
 * @returns {Object}
 */
export function appRouter() {
  if (!routerInstance) {
    throw new Error('Router has not been initialized')
  }

  return routerInstance
}

/**
 * Create and configure the application router.
 *
 * @param {AuthService} auth
 * @returns {Object}
 */
export function setupRouter(auth) {
  var router = createRouter({
    history: createWebHistory(APP_BASE),
    linkExactActiveClass: 'active',
    routes: [
      {
        path: '/',
        name: 'discover',
        component: Discover,
        meta: {
          keepAlive: true
        }
      },
      {
        name: 'login',
        path: '/login',
        component: Login,
        props: function(route) {
          return {
            returnTo: route.query.returnTo
          }
        },
        meta: {
          layout: 'fullscreen'
        }
      },
      {
        name: 'queue',
        path: '/queue',
        component: Queue,
        meta: {
          keepAlive: true
        }
      },
      {
        name: 'albums-default',
        path: '/albums',
        redirect: {
          name: 'albums',
          params: { sort: 'recently-added' }
        },
        meta: {
          keepAlive: true
        }
      },
      {
        name: 'albums',
        path: '/albums/:sort',
        component: AlbumLibrary,
        props: true,
        meta: {
          keepAlive: true
        }
      },
      {
        name: 'album',
        path: '/albums/id/:id',
        component: AlbumDetails,
        props: true,
        meta: {
          keepAlive: true
        }
      },
      {
        name: 'artists',
        path: '/artists/:sort?',
        component: ArtistLibrary,
        props: true,
        meta: {
          keepAlive: true
        }
      },
      {
        name: 'artist',
        path: '/artists/id/:id',
        component: ArtistDetails,
        props: true,
        meta: {
          keepAlive: true
        }
      },
      {
        name: 'genres',
        path: '/genres/:sort?',
        component: GenreLibrary,
        props: true,
        meta: {
          keepAlive: true
        }
      },
      {
        name: 'genre',
        path: '/genres/id/:id/:section?',
        component: GenreDetails,
        props: true,
        meta: {
          keepAlive: true
        }
      },
      {
        name: 'favourites',
        path: '/favourites/:section?',
        component: Favourites,
        props: true,
        meta: {
          keepAlive: true
        }
      },
      {
        name: 'playlists',
        path: '/playlists/:sort?',
        component: PlaylistLibrary,
        props: true,
        meta: {
          keepAlive: true
        }
      },
      {
        name: 'playlist',
        path: '/playlist/:id',
        component: Playlist,
        props: true,
        meta: {
          keepAlive: true
        }
      },
      {
        name: 'search',
        path: '/search/:type?',
        component: SearchResult,
        props: function(route) {
          return Object.assign({}, route.params, route.query)
        }
      }
    ],

    // Scroll restoration logic.
    scrollBehavior: async function(to, from, savedPosition) {
      var heavyRoutes = ['discover', 'albums', 'artists', 'genre']

      if (savedPosition) {
        await nextTick()

        var position = {
          left: savedPosition.left,
          top: Math.max(savedPosition.top - 38, 0)
        }
        var delay = 100

        if (heavyRoutes.indexOf(to.name) !== -1) {
          delay = 500
        }

        await new Promise(function(resolve) {
          setTimeout(resolve, delay)
        })

        return position
      }

      if (to.hash) {
        return {
          el: to.hash,
          behavior: 'smooth'
        }
      }

      return { left: 0, top: 0 }
    }
  })

  router.beforeEach(function(to, from, next) {
    if (to.name !== 'login' && !auth.isAuthenticated()) {
      // Remove the base path prefix to keep the redirect relative.
      var full = to.fullPath

      if (to.fullPath.indexOf(APP_BASE) === 0) {
        full = to.fullPath.slice(APP_BASE.length - 1)
      }

      next({ name: 'login', query: { returnTo: full } })
    } else {
      next()
    }
  })

  routerInstance = router
  return router
}
