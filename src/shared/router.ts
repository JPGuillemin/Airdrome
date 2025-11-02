import { createRouter, createWebHistory } from 'vue-router'
import Login from '@/auth/Login.vue'
import Queue from '@/player/Queue.vue'
import Discover from '@/discover/Discover.vue'
import ArtistDetails from '@/library/artist/ArtistDetails.vue'
import ArtistLibrary from '@/library/artist/ArtistLibrary.vue'
import AlbumDetails from '@/library/album/AlbumDetails.vue'
import AlbumLibrary from '@/library/album/AlbumLibrary.vue'
import GenreDetails from '@/library/genre/GenreDetails.vue'
import GenreLibrary from '@/library/genre/GenreLibrary.vue'
import Favourites from '@/library/favourite/Favourites.vue'
import Playlist from '@/library/playlist/Playlist.vue'
import PlaylistLibrary from '@/library/playlist/PlaylistLibrary.vue'
import SearchResult from '@/library/search/SearchResult.vue'
import Files from '@/library/file/Files.vue'
import { AuthService } from '@/auth/service'

export function setupRouter(auth: AuthService) {
  const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
      // Home / Discover
      {
        path: '/home',
        name: 'home',
        component: Discover,
        meta: { keepAlive: true }
      },

      // Login
      {
        name: 'login',
        path: '/login',
        component: Login,
        props: route => ({
          returnTo: route.query.returnTo
        }),
        meta: {
          layout: 'fullscreen',
          keepAlive: false
        }
      },

      // Queue
      {
        name: 'queue',
        path: '/queue',
        component: Queue,
        meta: { keepAlive: false }
      },

      // Albums
      {
        name: 'albums-default',
        path: '/albums',
        redirect: {
          name: 'albums',
          params: { sort: 'recently-added' }
        }
      },
      {
        name: 'albums',
        path: '/albums/:sort',
        component: AlbumLibrary,
        props: true,
        meta: { keepAlive: true }
      },
      {
        name: 'album',
        path: '/album/:id',
        component: AlbumDetails,
        props: true,
        meta: { keepAlive: false }
      },

      // Artists
      {
        name: 'artists',
        path: '/artists/:sort?',
        component: ArtistLibrary,
        props: true,
        meta: { keepAlive: true }
      },
      {
        name: 'artist',
        path: '/artist/:id',
        component: ArtistDetails,
        props: true,
        meta: { keepAlive: false }
      },

      // Genres
      {
        name: 'genres',
        path: '/genres/:sort?',
        component: GenreLibrary,
        props: true,
        meta: { keepAlive: true }
      },
      {
        name: 'genre',
        path: '/genre/:id/:section?',
        component: GenreDetails,
        props: true,
        meta: { keepAlive: false }
      },

      // Favourites
      {
        name: 'favourites',
        path: '/favourites/:section?',
        component: Favourites,
        props: true,
        meta: { keepAlive: true }
      },

      // Files
      {
        name: 'files',
        path: '/files/:path(.*)?',
        component: Files,
        props: true,
        meta: { keepAlive: true }
      },

      // Playlists
      {
        name: 'playlists',
        path: '/playlists/:sort?',
        component: PlaylistLibrary,
        props: true,
        meta: { keepAlive: true }
      },
      {
        name: 'playlist',
        path: '/playlist/:id',
        component: Playlist,
        props: true,
        meta: { keepAlive: false }
      },

      // Search
      {
        name: 'search',
        path: '/search/:type?',
        component: SearchResult,
        props: route => ({
          ...route.params,
          ...route.query
        }),
        meta: { keepAlive: true }
      }
    ],
  })

  // Inline scroll memory for better UX
  const scrollPositions = new Map<string, { left: number; top: number }>()
  const saveScrollPosition = (route: any) => {
    scrollPositions.set(route.fullPath, { left: window.scrollX, top: window.scrollY })
  }
  const getScrollPosition = (route: any) => scrollPositions.get(route.fullPath)

  router.beforeEach((to, from, next) => {
    saveScrollPosition(from)
    if (to.name !== 'login' && !auth.isAuthenticated()) {
      if (to.fullPath === '/') {
        next({ name: 'login', query: { returnTo: '/home' } })
      } else {
        next({ name: 'login', query: { returnTo: to.fullPath } })
      }
    } else {
      next()
    }
  })

  router.afterEach(to => {
    const pos = getScrollPosition(to)
    if (pos) {
      window.scrollTo(pos.left, pos.top)
    }
  })

  return router
}
