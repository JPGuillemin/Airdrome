import Router from 'vue-router'
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
import RadioStations from '@/library/radio/RadioStations.vue'
import PodcastDetails from '@/library/podcast/PodcastDetails.vue'
import PodcastLibrary from '@/library/podcast/PodcastLibrary.vue'
import Playlist from '@/library/playlist/Playlist.vue'
import PlaylistLibrary from '@/library/playlist/PlaylistLibrary.vue'
import SearchResult from '@/library/search/SearchResult.vue'
import { AuthService } from '@/auth/service'
import ArtistTracks from '@/library/artist/ArtistTracks.vue'
import Files from '@/library/file/Files.vue'

export function setupRouter(auth: AuthService) {
  const router = new Router({
    mode: 'history',
    linkExactActiveClass: 'active',
    base: import.meta.env.BASE_URL,
    scrollBehavior(to, from, savedPosition) {
      if (savedPosition) {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(savedPosition)
          }, 50)
        })
      } else {
        return { x: 0, y: 0 }
      }
    },
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
        name: 'artist-tracks',
        path: '/artists/id/:id/tracks',
        component: ArtistTracks,
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
        name: 'radio',
        path: '/radio',
        component: RadioStations,
      },
      {
        name: 'podcasts',
        path: '/podcasts/:sort?',
        component: PodcastLibrary,
        props: true,
      },
      {
        name: 'podcast',
        path: '/podcasts/id/:id',
        component: PodcastDetails,
        props: true,
      },
      {
        name: 'files',
        path: '/files/:path*',
        component: Files,
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
    ]
  })

  router.beforeEach((to, from, next) => {
    if (to.name !== 'login' && !auth.isAuthenticated()) {
      next({ name: 'login', query: { returnTo: to.fullPath } })
    } else {
      next()
    }
  })

  return router
}
