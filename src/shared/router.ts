// router.ts
import { createRouter, createWebHistory, type Router } from 'vue-router'
import { AuthService } from '@/auth/service'
import { nextTick } from 'vue'

// Lazily load route components so the initial bundle stays small.
const Login = () => import('@/auth/Login.vue')
const Queue = () => import('@/player/Queue.vue')
const Discover = () => import('@/discover/Discover.vue')
const ArtistDetails = () => import('@/library/artist/ArtistDetails.vue')
const ArtistLibrary = () => import('@/library/artist/ArtistLibrary.vue')
const AlbumDetails = () => import('@/library/album/AlbumDetails.vue')
const AlbumLibrary = () => import('@/library/album/AlbumLibrary.vue')
const GenreDetails = () => import('@/library/genre/GenreDetails.vue')
const GenreLibrary = () => import('@/library/genre/GenreLibrary.vue')
const Favourites = () => import('@/library/favourite/Favourites.vue')
const Playlist = () => import('@/library/playlist/Playlist.vue')
const PlaylistLibrary = () => import('@/library/playlist/PlaylistLibrary.vue')
const SearchResult = () => import('@/library/search/SearchResult.vue')

const APP_BASE = import.meta.env.BASE_URL

let routerInstance: Router | null = null

/** Router singleton for modules that cannot use useRouter() (e.g. stores). */
export function appRouter(): Router {
  if (!routerInstance) throw new Error('Router has not been initialized')
  return routerInstance
}

export function setupRouter(auth: AuthService) {
  const router = createRouter({
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
        props: (route) => ({
          returnTo: route.query.returnTo,
        }),
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
        redirect: ({
          name: 'albums',
          params: { sort: 'recently-added' }
        }),
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
        props: (route) => ({
          ...route.params,
          ...route.query,
        })
      },
    ],

    // scroll restoration logic
    scrollBehavior(to, from, savedPosition) {
      const heavyRoutes = ['discover', 'albums', 'artists', 'genre']
      if (savedPosition) {
        return new Promise(resolve => {
          nextTick().then(() => {
            if (heavyRoutes.includes(to.name as string)) {
              setTimeout(() => { resolve({ left: savedPosition.left, top: Math.max(savedPosition.top - 38, 0) }) }, 500)
            } else {
              setTimeout(() => { resolve({ left: savedPosition.left, top: Math.max(savedPosition.top - 38, 0) }) }, 100)
            }
          })
        })
      }
      if (to.hash) {
        return {
          el: to.hash,
          behavior: 'smooth',
        }
      }
      return { left: 0, top: 0 }
    },
  })

  router.beforeEach((to, from, next) => {
    if (to.name !== 'login' && !auth.isAuthenticated()) {
      // Remove the base path prefix to keep the redirect relative
      const full = to.fullPath.startsWith(APP_BASE)
        ? to.fullPath.slice(APP_BASE.length - 1)
        : to.fullPath

      next({ name: 'login', query: { returnTo: full } })
    } else {
      next()
    }
  })

  routerInstance = router
  return router
}
