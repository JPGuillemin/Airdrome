// Discover.vue
<template>
  <div class="main-content">
    <div v-if="result.genres.length > 0" class="section-wrapper pt-4">
      <div
        v-wheel-scroll="{ enabled: allowHScroll, speed: 0.9, friction: 0.88 }"
        class="d-flex gap-3 overflow-auto scroll"
      >
        <router-link
          v-for="item in result.genres"
          :key="item.id"
          :to="{ name: 'genre', params: { id: item.id } }"
          class="genre-link text-decoration-none"
        >
          {{ item.name }}
        </router-link>
      </div>
    </div>

    <div v-if="favartists.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'favourites', params: { section: 'artists' } }" class="d-inline-flex align-items-center">
          <Icon icon="heart" class="title-color me-2" />
          <span class="section-title">Fav artists</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Favourite Artists Radio"
          @click="radioFavouriteArtists()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <ArtistList :items="favartists" tile-size="140" allow-h-scroll />
    </div>

    <div v-if="result.mood.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'genre', params: { id: lastGenre.name } }" class="d-inline-flex align-items-center">
          <Icon icon="genres" class="title-color me-2" />
          <span class="section-title">Current mood</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Current Mood Radio"
          @click="radioMood()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <TrackTiles
        :items="result.mood" tile-size="45" allow-h-scroll three-rows with-artist />
    </div>

    <div v-if="result.recent.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'albums', params: { sort: 'recently-added' } }" class="d-inline-flex align-items-center">
          <Icon icon="new" class="title-color me-2" />
          <span class="section-title">Recently added</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Recently added Radio"
          @click="radioRecentlyAdded()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <AlbumList :items="result.recent" tile-size="140" allow-h-scroll @favourite-added="onFavouriteAdded" />
    </div>

    <div v-if="favalbums.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'favourites' }" class="d-inline-flex align-items-center">
          <Icon icon="heart" class="title-color me-2" />
          <span class="section-title">Fav albums</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Favourite Albums Radio"
          @click="radioFavouriteAlbums()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <AlbumList :items="favalbums" tile-size="140" allow-h-scroll @favourite-added="onFavouriteAdded" />
    </div>

    <div v-if="result.playlists.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'playlists' }" class="d-inline-flex align-items-center">
          <Icon icon="playlist" class="title-color me-2" />
          <span class="section-title">Playlists</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Global Radio"
          @click="luckyRadio()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <PlaylistList :items="result.playlists" tile-size="140" allow-h-scroll />
    </div>

    <div v-if="randomTracks.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'albums', params: { sort: 'random' } }" class="d-inline-flex align-items-center">
          <Icon icon="random" class="title-color me-2" />
          <span class="section-title">Get lucky</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Random play"
          @click="luckyRadio()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <TrackTiles :items="randomTracks" tile-size="45" allow-h-scroll three-rows with-artist />
    </div>

    <div v-if="result.played.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'albums', params: { sort: 'recently-played' } }" class="d-inline-flex align-items-center">
          <Icon icon="recent" class="title-color me-2" />
          <span class="section-title">Recently played</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Recently Played Radio"
          @click="radioRecentlyPlayed()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <AlbumList :items="result.played" tile-size="150" allow-h-scroll @favourite-added="onFavouriteAdded" />
    </div>

    <div v-if="result.most.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'albums', params: { sort: 'most-played' } }" class="d-inline-flex align-items-center">
          <Icon icon="most" class="title-color me-2" />
          <span class="section-title">Most Played</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Most Played Radio"
          @click="radioMostPlayed()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <AlbumList :items="result.most" tile-size="140" allow-h-scroll @favourite-added="onFavouriteAdded" />
    </div>
  </div>
</template>

<script>
  import { defineComponent, ref, computed, onMounted, onActivated, onBeforeUnmount, watch } from 'vue'
  import { inject } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import PlaylistList from '@/library/playlist/PlaylistList.vue'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import TrackTiles from '@/library/track/TrackTiles.vue'
  import { orderBy } from 'lodash-es'
  import { reloadToken } from '@/shared/reload'
  import { useRadioStore } from '@/player/radio'
  import { usePlayerStore } from '@/player/store'
  import { longPressTooltip } from '@/shared/tooltips'
  import { useFavouriteStore } from '@/library/favourite/store'

  // Short delay after a scrobble so the server has time to register it
  // before we refetch the "recently played" albums.
  var PLAYED_REFRESH_DELAY_MS = 1500

  export default defineComponent({
    components: {
      AlbumList: AlbumList,
      ArtistList: ArtistList,
      PlaylistList: PlaylistList,
      TrackTiles: TrackTiles,
    },

    directives: {
      'longpress-tooltip': longPressTooltip
    },

    setup: function () {
      var api = inject('$api')
      var favouriteStore = useFavouriteStore()
      var player = usePlayerStore()

      var loading = ref(false)

      /** Sections shown on the dashboard. */
      var result = ref({
        recent: [],
        played: [],
        mood: [],
        most: [],
        genres: [],
        playlists: [],
      })

      var favalbums = ref([])
      var favartists = ref([])
      var randomTracks = ref([])
      var lastGenre = ref(null)

      var empty = computed(function () {
        return Object.values(result.value).findIndex(function (x) {
          return x.length > 0
        }) === -1 && randomTracks.value.length === 0
      })

      // Fetch "recently played" albums. On the initial load (initial = true) it also
      // builds the "Current mood" section; on later refreshes the mood is left untouched
      // so the tiles don't reshuffle under the user's cursor.
      async function fetchPlayed(initial) {
        if (initial === undefined) {
          initial = false
        }

        var played = await api.getAlbums('recently-played', 32)
        var firstLabel = undefined

        if (played[0]) {
          if (played[0].name != null) {
            firstLabel = played[0].name
          } else {
            firstLabel = played[0].id
          }
        }

        console.info('[Discover] recently-played fetched, first =', firstLabel)

        // Skip the update if nothing changed (avoids needless re-renders / scroll jumps)
        var sameOrder = played.length === result.value.played.length

        if (sameOrder) {
          for (var i = 0; i < played.length; i++) {
            if (played[i].id !== result.value.played[i].id) {
              sameOrder = false
              break
            }
          }
        }

        if (!sameOrder) {
          result.value.played = played
        }

        if (!initial || played.length === 0) {
          return
        }

        var lastPlayed = played[0]
        lastGenre.value = lastPlayed.genres[0]

        if (!lastGenre.value) {
          return
        }

        var tracksByGenre = await api.getTracksByGenre(
          lastGenre.value.name,
          200,
          0
        )

        result.value.mood = tracksByGenre
          .sort(function () {
            return Math.random() - 0.5
          })
          .slice(0, 72)
      }

      async function loadGenres() {
        var genres = await api.getGenres()
        var genreNames = genres.map(function (genre) {
          return Object.assign({}, genre, { id: genre.name })
        })

        result.value.genres = orderBy(genreNames, 'albumCount', 'desc')
      }

      async function loadFavourites() {
        var favourites = await api.getFavourites()
        favartists.value = favourites.artists.slice(0, 16)
        favalbums.value = favourites.albums.slice(0, 16)
      }

      async function loadRecentAlbums() {
        result.value.recent = await api.getAlbums('recently-added', 32)
      }

      async function loadRandomTracks() {
        randomTracks.value = await api.getRandomTracks({ size: 50 })
      }

      async function loadMostPlayed() {
        result.value.most = await api.getAlbums('most-played', 32)
      }

      async function fetchData() {
        if (loading.value) {
          return
        }

        loading.value = true

        try {
          loadGenres()
          loadFavourites()
          fetchPlayed(true)
          loadRecentAlbums()

          var playlists = await api.getPlaylists()
          result.value.playlists = playlists.slice(0, 10)

          loadRandomTracks()
          loadMostPlayed()
        } finally {
          loading.value = false
        }
      }

      // --- Dynamic "Recently played" -------------------------------------------------
      var refreshTimer = undefined

      function schedulePlayedRefresh() {
        if (refreshTimer) {
          clearTimeout(refreshTimer)
        }

        refreshTimer = setTimeout(async function () {
          refreshTimer = undefined

          try {
            await fetchPlayed(false)
          } catch (err) {
            /* ignore transient network errors */
          }
        }, PLAYED_REFRESH_DELAY_MS)
      }

      // Immediate, optimistic update: when a track starts, move its album to the
      // front of the list if it is already there (no server round-trip needed).
      watch(
        function () {
          if (player.track) {
            return player.track.albumId
          }

          return undefined
        },
        function (albumId) {
          if (!albumId) {
            return
          }

          var list = result.value.played
          var position = -1
          var i

          for (i = 0; i < list.length; i++) {
            if (list[i].id === albumId) {
              position = i
              break
            }
          }

          if (position > 0) {
            var reordered = [list[position]]

            for (i = 0; i < position; i++) {
              reordered.push(list[i])
            }

            for (i = position + 1; i < list.length; i++) {
              reordered.push(list[i])
            }

            result.value.played = reordered
          }
        }
      )

      // The player scrobbles once the current track passes 50 %
      // (player.scrobbled flips to true, and back to false on the next track).
      // That is the moment the server's "recently played" list actually changes.
      watch(
        function () {
          return player.scrobbled
        },
        function (scrobbled) {
          console.info('[Discover] scrobbled =', scrobbled)

          if (scrobbled) {
            schedulePlayedRefresh()
          }
        }
      )

      // If the view is kept alive (<keep-alive>), refresh when it becomes active again
      var firstActivation = true

      onActivated(async function () {
        if (firstActivation) {
          firstActivation = false
          return
        }

        try {
          await fetchPlayed(false)
        } catch (err) {
          /* ignore transient network errors */
        }
      })

      onBeforeUnmount(function () {
        if (refreshTimer) {
          clearTimeout(refreshTimer)
        }
      })
      // -------------------------------------------------------------------------------

      // When an album is toggled ON from any AlbumList in this view, add it to favalbums
      function onFavouriteAdded(album) {
        var exists = false

        for (var i = 0; i < favalbums.value.length; i++) {
          if (favalbums.value[i].id === album.id) {
            exists = true
            break
          }
        }

        if (!exists) {
          favalbums.value = [album].concat(favalbums.value)
        }
      }

      // When an album/artist is toggled OFF, remove it from the fav lists
      watch(
        function () {
          return favouriteStore.albums
        },
        function (newAlbums) {
          favalbums.value = favalbums.value.filter(function (a) {
            return !!newAlbums[a.id]
          })
        }
      )
      watch(
        function () {
          return favouriteStore.artists
        },
        function (newArtists) {
          favartists.value = favartists.value.filter(function (a) {
            return !!newArtists[a.id]
          })
        }
      )

      var radio = useRadioStore()

      function radioRecentlyPlayed() {
        return radio.shuffleRecentlyPlayed()
      }

      function radioMostPlayed() {
        return radio.shuffleMostPlayed()
      }

      function radioFavouriteAlbums() {
        return radio.shuffleFavouriteAlbums()
      }

      function radioFavouriteArtists() {
        return radio.shuffleFavouriteArtists()
      }

      function radioRecentlyAdded() {
        return radio.shuffleRecentlyAdded()
      }

      function luckyRadio() {
        return radio.luckyRadio()
      }

      function radioMood() {
        if (lastGenre.value) {
          return radio.shuffleMood(lastGenre.value.name)
        }

        return undefined
      }

      onMounted(fetchData)

      watch(reloadToken, function () {
        favalbums.value = []
        favartists.value = []
        randomTracks.value = []

        Object.assign(result.value, {
          recent: [],
          played: [],
          mood: [],
          most: [],
          genres: [],
          playlists: [],
        })

        fetchData()
      })

      return {
        result: result,
        favartists: favartists,
        favalbums: favalbums,
        randomTracks: randomTracks,
        lastGenre: lastGenre,
        loading: loading,
        empty: empty,
        fetchData: fetchData,
        onFavouriteAdded: onFavouriteAdded,
        radioRecentlyPlayed: radioRecentlyPlayed,
        radioMostPlayed: radioMostPlayed,
        radioFavouriteAlbums: radioFavouriteAlbums,
        radioFavouriteArtists: radioFavouriteArtists,
        radioRecentlyAdded: radioRecentlyAdded,
        radioMood: radioMood,
        luckyRadio: luckyRadio,
      }
    },
  })
</script>
