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
import { AuthService } from '@/auth/service'
import { nextTick } from 'vue'

const APP_BASE = import.meta.env.BASE_URL

export function setupRouter(auth: AuthService) {
  const router = createRouter({
    history: createWebHistory(APP_BASE),
    linkExactActiveClass: 'active',
    routes: [
      {
        path: '/',
        name: 'home',
        component: Discover
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
      },
      {
        name: 'albums-default',
        path: '/albums',
        redirect: ({
          name: 'albums',
          params: { sort: 'recently-added' }
        }),
      },
      {
        name: 'albums',
        path: '/albums/:sort',
        component: AlbumLibrary,
        props: true
      },
      {
        name: 'album',
        path: '/albums/id/:id',
        component: AlbumDetails,
        props: true,
      },
      {
        name: 'artists',
        path: '/artists/:sort?',
        component: ArtistLibrary,
        props: true,
      },
      {
        name: 'artist',
        path: '/artists/id/:id',
        component: ArtistDetails,
        props: true,
      },
      {
        name: 'genres',
        path: '/genres/:sort?',
        component: GenreLibrary,
        props: true,
      },
      {
        name: 'genre',
        path: '/genres/id/:id/:section?',
        component: GenreDetails,
        props: true,
      },
      {
        name: 'favourites',
        path: '/favourites/:section?',
        component: Favourites,
        props: true,
      },
      {
        name: 'playlists',
        path: '/playlists/:sort?',
        component: PlaylistLibrary,
        props: true,
      },
      {
        name: 'playlist',
        path: '/playlist/:id',
        component: Playlist,
        props: true,
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

    // Native scroll restoration logic
    scrollBehavior(to, from, savedPosition) {
      const heavyRoutes = ['home', 'albums', 'artists', 'genre']
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

  return router
}
