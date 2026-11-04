<template>
  <div v-if="album" class="main-content">
    <div class="header-wrapper">
      <Header :image="album.image" :hover="'Play/Pause'" class="cursor-pointer can-select" @click="playPause">
        <div class="header-title-wrapper">
          <div class="header-title">
            {{ album.name }}
          </div>
        </div>

        <div class="header-info-wrapper">
          <div class="header-info-one">
            <template v-if="album.artists && album.artists.length">
              <span v-for="(artist, index) in album.artists" :key="artist.id" class="d-inline-flex flex-nowrap">
                <span v-if="index > 0">, </span>
                <router-link :to="{ name: 'artist', params: { id: artist.id }}">
                  {{ artist.name }}
                </router-link>
              </span>
            </template>
            <template v-if="album.year">
              <span class="mx-2">•</span>
              <span class="d-inline-flex flex-nowrap">
                {{ album.year }}
              </span>
            </template>
          </div>

          <div v-if="album.genres && album.genres.length" class="header-info-two">
            <span v-for="(genre, index) in album.genres" :key="genre.name">
              <span v-if="index > 0">, </span>
              <router-link :to="{ name: 'genre', params: { id: genre.name }}">
                {{ genre.name }}
              </router-link>
            </span>
          </div>
        </div>

        <div class="text-nowrap">
          <b-button v-longpress-tooltip variant="transparent" class="header-buttons" title="Album Play" @click="playNow">
            <Icon icon="recycle" />
          </b-button>
          <b-button v-longpress-tooltip variant="transparent" class="header-buttons" title="Album Shuffle" @click="shuffleNow">
            <Icon icon="random" />
          </b-button>
          <b-button v-longpress-tooltip variant="transparent" class="header-buttons" title="Album Radio" @click="RadioNow">
            <Icon icon="radio" />
          </b-button>
          <b-button v-longpress-tooltip variant="transparent" class="header-buttons" title="Like Album" @click="toggleFavourite">
            <Icon :icon="favouriteIcon" />
          </b-button>
          <ExternalLink :href="listenBrainzUrl" class="btn btn-link header-buttons" title="MusicBrainz">
            <IconMusicBrainz />
          </ExternalLink>
          <OverflowMenu direction="up" variant="transparent" class="header-buttons">
            <TrackMenuItem icon="plus" class="on-top" @click="setNextInQueue">
              Next
            </TrackMenuItem>
            <TrackMenuItem icon="plus" class="on-top" @click="addToQueue">
              Queue
            </TrackMenuItem>
            <TrackMenuItem icon="plus" class="on-top" @click="addToPlaylist">
              Playlist
            </TrackMenuItem>
            <TrackMenuItem v-if="!cached" icon="download" class="on-top" @click="cacheAlbum">
              Cache
            </TrackMenuItem>
            <TrackMenuItem v-if="cached" icon="trash" class="on-top" @click="clearAlbumCache">
              Cache
            </TrackMenuItem>
          </OverflowMenu>
        </div>
      </Header>
    </div>
    <div class="content-wrapper">
      <TrackList
        :tracks="album.tracks || []"
        class="mt-3"
        :no-album="true"
        :show-image="true"
        :no-artist="true"
      />
      <div v-if="album.description" class="row">
        <div class="d-inline-flex align-items-center mt3">
          <Icon icon="info" class="title-color me-2" />
          <span class="section-title">
            Background info
          </span>
        </div>
        <span class="d-flex justify-content-between adapt-text mb-2 can-select" style="text-align: justify;">
          {{ album.description }}
        </span>
      </div>
    </div>
    <Teleport to="body">
      <EditPlaylistModal
        v-if="showPlaylistModal"
        :playlist="playlistDraft"
        mode="add"
        @add-to-playlist="addToExistingPlaylist"
        @create-playlist="createPlaylist"
        @close="showPlaylistModal = false"
      />
    </Teleport>
  </div>
</template>
<script>
  import { defineComponent, ref, inject, computed } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlaylistStore } from '@/library/playlist/store'
  import { usePlayerStore } from '@/player/store'
  import { useCacheStore } from '@/shared/cache'
  import { useLoader } from '@/shared/loader'
  import TrackList from '@/library/track/TrackList.vue'
  import EditPlaylistModal from '@/library/playlist/EditPlaylistModal.vue'
  import IconMusicBrainz from '@/shared/components/IconMusicBrainz.vue'
  import { useRouter, useRoute } from 'vue-router'
  import { useRadioStore } from '@/player/radio'
  import { longPressTooltip } from '@/shared/tooltips'
  import { getAlbumListenBrainzUrl } from '@/shared/musicbrainz'

  /** Shallow-copy the own enumerable keys of an object (ES5 object spread). */
  function copyObject(source) {
    var target = {}

    if (!source) {
      return target
    }

    var keys = Object.keys(source)

    for (var i = 0; i < keys.length; i++) {
      target[keys[i]] = source[keys[i]]
    }

    return target
  }

  /** Whether a track list contains the given track id. */
  function trackListContains(tracks, id) {
    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].id === id) {
        return true
      }
    }

    return false
  }

  export default defineComponent({
    components: {
      TrackList: TrackList,
      IconMusicBrainz: IconMusicBrainz,
      EditPlaylistModal: EditPlaylistModal
    },

    directives: {
      'longpress-tooltip': longPressTooltip
    },

    props: {
      /** Album id taken from the route. */
      id: { type: String, required: true }
    },

    setup: function (props) {
      var favouriteStore = useFavouriteStore()
      var playlistStore = usePlaylistStore()
      var playerStore = usePlayerStore()
      var cacheStore = useCacheStore()
      var api = inject('$api')
      var loader = useLoader()
      var router = useRouter()
      var route = useRoute()
      var radioStore = useRadioStore()

      var album = ref(null)
      var cached = ref(false)

      var isFavourite = computed(function () {
        return favouriteStore.get('album', props.id)
      })

      var isPlaying = computed(function () {
        return playerStore.isPlaying
      })

      var favouriteIcon = computed(function () {
        if (isFavourite.value) {
          return 'heart-fill'
        }

        return 'heart'
      })

      var listenBrainzUrl = ref(null)

      /** Fetch album details, cache state and the ListenBrainz URL. */
      async function fetchAlbum() {
        loader.showLoading()

        try {
          var result = await api.getAlbumDetails(props.id)
          album.value = result
          cached.value = await cacheStore.isCached(result)

          if (result.musicBrainzUrl) {
            listenBrainzUrl.value = result.musicBrainzUrl
          } else {
            var artistName = ''

            if (result.artists && result.artists.length &&
              result.artists[0].name !== null && result.artists[0].name !== undefined) {
              artistName = result.artists[0].name
            }

            listenBrainzUrl.value = await getAlbumListenBrainzUrl(artistName, result.name)
          }
        } finally {
          loader.hideLoading()
        }
      }

      function playPause() {
        if (!album.value || !album.value.tracks || !album.value.tracks.length) {
          return
        }

        var currentTrack = playerStore.track

        if (currentTrack && trackListContains(album.value.tracks, currentTrack.id)) {
          return playerStore.playPause()
        }

        return playerStore.playNow(album.value.tracks)
      }

      function playNow() {
        var currentTrack = playerStore.track
        var firstTrack = null

        if (album.value && album.value.tracks && album.value.tracks.length) {
          firstTrack = album.value.tracks[0]
        }

        if (currentTrack && firstTrack && currentTrack.id === firstTrack.id) {
          return
        }

        if (!album.value) {
          return
        }

        if (album.value.tracks && album.value.tracks.length) {
          return playerStore.playNow(album.value.tracks)
        }
      }

      function setNextInQueue() {
        if (album.value) {
          return playerStore.setNextInQueue(album.value.tracks)
        }
      }

      function addToQueue() {
        if (album.value) {
          return playerStore.addToQueue(album.value.tracks)
        }
      }

      // "Playlist +": open a form to pick an existing playlist or create a new
      // one (name pre-filled with the album name), then add all album tracks.
      var showPlaylistModal = ref(false)

      var playlistDraft = computed(function () {
        var name = ''

        if (album.value && album.value.name) {
          name = album.value.name
        }

        return {
          name: name,
          comment: '',
          isPublic: false,
        }
      })

      /** Collect the ids of every track of the current album. */
      function albumTrackIds() {
        var ids = []

        if (album.value && album.value.tracks) {
          for (var i = 0; i < album.value.tracks.length; i++) {
            ids.push(album.value.tracks[i].id)
          }
        }

        return ids
      }

      async function addToPlaylist() {
        if (!album.value || !album.value.tracks || !album.value.tracks.length) {
          return
        }

        if (playlistStore.playlists !== null) {
          showPlaylistModal.value = true
          return
        }

        loader.showLoading()

        try {
          await playlistStore.load()
        } catch (error) {
          console.error(error)
          return
        } finally {
          loader.hideLoading()
        }

        showPlaylistModal.value = true
      }

      async function addToExistingPlaylist(playlistId) {
        if (!album.value || !album.value.tracks || !album.value.tracks.length) {
          return
        }

        showPlaylistModal.value = false
        loader.showLoading()

        try {
          await playlistStore.addUniqueTracks(playlistId, albumTrackIds())
        } catch (error) {
          console.error(error)
        } finally {
          loader.hideLoading()
        }
      }

      async function createPlaylist(name) {
        if (!album.value || !album.value.tracks || !album.value.tracks.length) {
          return
        }

        showPlaylistModal.value = false
        loader.showLoading()

        try {
          await playlistStore.addToPlaylistByName(name, albumTrackIds())
        } catch (error) {
          console.error(error)
        } finally {
          loader.hideLoading()
        }
      }

      async function toggleFavourite() {
        await favouriteStore.toggle('album', props.id)
      }

      async function cacheAlbum() {
        if (album.value) {
          await cacheStore.cacheAlbum(album.value)
          cached.value = true
        }
      }

      async function clearAlbumCache() {
        if (!album.value) {
          return
        }

        await cacheStore.clearAlbumCache(album.value)
        cached.value = false

        var query = copyObject(route.query)
        query.t = Date.now().toString()

        return router.replace({
          name: route.name,
          params: copyObject(route.params),
          query: query,
        })
      }

      async function shuffleNow() {
        if (!album.value || !album.value.tracks || !album.value.tracks.length) {
          return
        }

        await radioStore.shuffleAlbum(album.value.tracks)
      }

      async function RadioNow() {
        if (!album.value || !album.value.tracks || !album.value.tracks.length ||
          !album.value.artists || !album.value.artists.length) {
          return
        }

        await radioStore.radioAlbum(album.value.tracks, album.value.artists)
      }

      fetchAlbum()

      return {
        album: album,
        cached: cached,
        favouriteStore: favouriteStore,
        playlistStore: playlistStore,
        playerStore: playerStore,
        cacheStore: cacheStore,
        isFavourite: isFavourite,
        isPlaying: isPlaying,
        favouriteIcon: favouriteIcon,
        playPause: playPause,
        playNow: playNow,
        shuffleNow: shuffleNow,
        RadioNow: RadioNow,
        setNextInQueue: setNextInQueue,
        addToQueue: addToQueue,
        addToPlaylist: addToPlaylist,
        addToExistingPlaylist: addToExistingPlaylist,
        createPlaylist: createPlaylist,
        showPlaylistModal: showPlaylistModal,
        playlistDraft: playlistDraft,
        toggleFavourite: toggleFavourite,
        cacheAlbum: cacheAlbum,
        clearAlbumCache: clearAlbumCache,
        listenBrainzUrl: listenBrainzUrl,
      }
    },
  })
</script>
