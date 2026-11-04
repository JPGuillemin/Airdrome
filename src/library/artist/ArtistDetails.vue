<template>
  <div v-if="artist" class="main-content">
    <div class="header-wrapper">
      <Header :image="artist.image" :hover="'Play/Pause'" class="cursor-pointer can-select" @click="shuffleNow">
        <div class="header-title-wrapper">
          <div class="header-title">
            {{ artist.name }}
          </div>
        </div>

        <div class="header-info-wrapper">
          <div class="header-info-one">
            <span class="text-nowrap">
              <strong>{{ artist.albumCount }}</strong> albums
            </span>
            <span class="mx-2">•</span>
            <span class="text-nowrap">
              <strong>{{ artist.trackCount }}</strong> tracks
            </span>
          </div>

          <div class="header-info-two">
            <template v-if="artist.genres.length > 0">
              <span v-for="(genreItem, index) in artist.genres" :key="genreItem.name">
                <span v-if="index > 0">, </span>
                <router-link :to="{name: 'genre', params: { id: genreItem.name }}">
                  {{ genreItem.name }}
                </router-link>
              </span>
            </template>
          </div>
        </div>

        <div class="text-nowrap">
          <b-button v-if="artist.trackCount > 0" v-longpress-tooltip variant="transparent" class="header-buttons" title="Play Artist Top Tracks" @click="playNow">
            <Icon icon="play" />
          </b-button>
          <b-button v-if="artist.trackCount > 0" v-longpress-tooltip variant="transparent" class="header-buttons" title="Artist Shuffle" @click="shuffleNow">
            <Icon icon="random" />
          </b-button>
          <b-button v-if="artist.trackCount > 0" v-longpress-tooltip variant="transparent" class="header-buttons" title="Artist Radio" @click="RadioNow">
            <Icon icon="radio" />
          </b-button>
          <b-button v-if="artist.trackCount > 0" v-longpress-tooltip variant="transparent" class="header-buttons" title="Like Artist" @click="toggleFavourite">
            <Icon :icon="favouriteIcon" />
          </b-button>
          <ExternalLink :href="listenBrainzUrl" class="btn btn-link header-buttons" title="MusicBrainz">
            <IconMusicBrainz />
          </ExternalLink>
          <OverflowMenu v-if="artist.trackCount > 0" direction="up" variant="transparent" class="header-buttons">
            <TrackMenuItem icon="plus" class="on-top" @click="addToPlaylist">
              Playlist
            </TrackMenuItem>
          </OverflowMenu>
        </div>
      </Header>
    </div>
    <div class="content-wrapper">
      <template v-if="artist.topTracks.length > 0">
        <div class="d-flex justify-content-between mt-3 mb-2">
          <div class="d-inline-flex align-items-center">
            <Icon icon="tracks" class="title-color me-2" />
            <span class="section-title">
              Top tracks
            </span>
          </div>
        </div>
        <TrackList
          :tracks="artist.topTracks"
          :no-artist="true"
        />
      </template>
      <template v-if="artist.albums.length > 0">
        <div class="d-inline-flex align-items-center">
          <Icon icon="albums" class="title-color me-2" />
          <span class="section-title">
            Albums
          </span>
        </div>
        <AlbumList :items="artist.albums" tile-size="90" :with-artist="false" :with-date="true" :allow-h-scroll="true" />
      </template>
      <template v-if="artist.similarArtist.length > 0">
        <div class="d-inline-flex align-items-center">
          <Icon icon="artists" class="title-color me-2" />
          <span class="section-title">
            Similar artists
          </span>
        </div>
        <ArtistList :items="artist.similarArtist" tile-size="90" allow-h-scroll />
      </template>
      <template v-if="artist.description">
        <div class="d-inline-flex align-items-center">
          <Icon icon="info" class="title-color me-2" />
          <span class="section-title">
            Background info
          </span>
        </div>
        <span class="d-flex justify-content-between adapt-text mb-2 can-select" style="text-align: justify;">
          {{ artist.description }}
        </span>
      </template>
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
  import { defineComponent, ref, onMounted, inject, computed } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import TrackList from '@/library/track/TrackList.vue'
  import EditPlaylistModal from '@/library/playlist/EditPlaylistModal.vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlaylistStore } from '@/library/playlist/store'
  import { useMainStore } from '@/shared/store'
  import { usePlayerStore } from '@/player/store'
  import IconMusicBrainz from '@/shared/components/IconMusicBrainz.vue'
  import { useRadioStore } from '@/player/radio'
  import { longPressTooltip } from '@/shared/tooltips'
  import { useLoader } from '@/shared/loader'
  import { getArtistListenBrainzUrl } from '@/shared/musicbrainz'

  export default defineComponent({
    components: {
      IconMusicBrainz: IconMusicBrainz,
      AlbumList: AlbumList,
      ArtistList: ArtistList,
      TrackList: TrackList,
      EditPlaylistModal: EditPlaylistModal,
    },

    directives: {
      'longpress-tooltip': longPressTooltip
    },

    props: {
      /** Artist identifier from the route. */
      id: { type: String, required: true },
    },

    setup: function (props) {
      var mainStore = useMainStore()
      var favouriteStore = useFavouriteStore()
      var playlistStore = usePlaylistStore()
      var playerStore = usePlayerStore()
      var loader = useLoader()
      var radioStore = useRadioStore()

      /** Artist details, null while they are being fetched. */
      var artist = ref(null)
      var api = inject('$api')

      /** MusicBrainz / ListenBrainz URL displayed in the header. */
      var listenBrainzUrl = ref(null)

      var isFavourite = computed(function () {
        return favouriteStore.get('artist', props.id)
      })

      var favouriteIcon = computed(function () {
        if (isFavourite.value) {
          return 'heart-fill'
        }

        return 'heart'
      })

      async function playNow() {
        return await playerStore.playNow(artist.value.topTracks)
      }

      async function shuffleNow() {
        return await radioStore.shuffleArtist(props.id)
      }

      async function RadioNow() {
        return await radioStore.radioArtist(props.id)
      }

      async function toggleFavourite() {
        return await favouriteStore.toggle('artist', props.id)
      }

      function toggleAlbumSortOrder() {
        return mainStore.toggleArtistAlbumSortOrder()
      }

      // "Playlist +": open a form to pick an existing playlist or create a new
      // one (name pre-filled with the artist name), then add all tracks of the
      // artist (from all their albums). Tracks are only fetched once the
      // target playlist is known.
      var showPlaylistModal = ref(false)

      /** Draft playlist used to prefill the playlist creation form. */
      var playlistDraft = computed(function () {
        var name = ''

        if (artist.value && artist.value.name) {
          name = artist.value.name
        }

        return {
          name: name,
          comment: '',
          isPublic: false,
        }
      })

      /**
       * Collect the IDs of every track of the artist.
       *
       * @returns {Promise<string[]>}
       */
      async function fetchAllTrackIds() {
        var ids = []
        var iterator = api.getTracksByArtist(props.id)

        while (true) {
          var item = await iterator.next()

          if (item.done) {
            break
          }

          var tracks = item.value

          for (var i = 0; i < tracks.length; i++) {
            ids.push(tracks[i].id)
          }
        }

        return ids
      }

      async function addToPlaylist() {
        if (!artist.value) {
          return
        }

        if (playlistStore.playlists === null) {
          loader.showLoading()

          try {
            await playlistStore.load()
          } catch (err) {
            console.error(err)
            return
          } finally {
            loader.hideLoading()
          }
        }

        showPlaylistModal.value = true
      }

      async function addToExistingPlaylist(playlistId) {
        showPlaylistModal.value = false
        loader.showLoading()

        try {
          var ids = await fetchAllTrackIds()
          await playlistStore.addUniqueTracks(playlistId, ids)
        } catch (err) {
          console.error(err)
        } finally {
          loader.hideLoading()
        }
      }

      async function createPlaylist(name) {
        showPlaylistModal.value = false
        loader.showLoading()

        try {
          var ids = await fetchAllTrackIds()
          await playlistStore.addToPlaylistByName(name, ids)
        } catch (err) {
          console.error(err)
        } finally {
          loader.hideLoading()
        }
      }

      // Fetch artist details
      async function fetchArtist() {
        loader.showLoading()

        try {
          artist.value = await api.getArtistDetails(props.id)

          if (artist.value.musicBrainzUrl) {
            listenBrainzUrl.value = artist.value.musicBrainzUrl
          } else {
            listenBrainzUrl.value = await getArtistListenBrainzUrl(artist.value.name)
          }
        } finally {
          loader.hideLoading()
        }
      }

      fetchArtist()

      return {
        mainStore: mainStore,
        favouriteStore: favouriteStore,
        playlistStore: playlistStore,
        playerStore: playerStore,
        artist: artist,
        isFavourite: isFavourite,
        favouriteIcon: favouriteIcon,
        playNow: playNow,
        shuffleNow: shuffleNow,
        RadioNow: RadioNow,
        toggleFavourite: toggleFavourite,
        toggleAlbumSortOrder: toggleAlbumSortOrder,
        addToPlaylist: addToPlaylist,
        addToExistingPlaylist: addToExistingPlaylist,
        createPlaylist: createPlaylist,
        showPlaylistModal: showPlaylistModal,
        playlistDraft: playlistDraft,
        listenBrainzUrl: listenBrainzUrl,
      }
    },
  })
</script>
