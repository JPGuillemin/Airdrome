// SearchResult.vue
<template>
  <div class="main-content">
    <div v-if="result.albums.length > 0" class="pb-2 pt-3">
      <div class="d-flex align-items-center justify-content-between">
        <router-link v-if="!type" :to="{params: {type: 'album'}, query: $route.query}" class="d-inline-flex align-items-center text-muted">
          <Icon icon="albums" class="title-color me-2" />
          <span class="section-title">
            Albums
          </span>
        </router-link>
        <div v-else class="d-inline-flex align-items-center">
          <Icon icon="albums" class="title-color me-2" />
          <span class="section-title">
            Albums
          </span>
        </div>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Albums Radio"
          @click="radioAlbums()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <AlbumList :items="result.albums" />
    </div>

    <div v-if="result.artists.length > 0" class="pb-2 pt-3">
      <div class="d-flex align-items-center justify-content-between">
        <router-link v-if="!type" :to="{params: {type: 'artist'}, query: $route.query}" class="d-inline-flex align-items-center text-muted">
          <Icon icon="artists" class="title-color me-2" />
          <span class="section-title">
            Artists
          </span>
        </router-link>
        <div v-else class="d-inline-flex align-items-center">
          <Icon icon="artists" class="title-color me-2" />
          <span class="section-title">
            Artists
          </span>
        </div>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Artists Radio"
          @click="radioArtists()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <ArtistList :items="result.artists" />
    </div>

    <div v-if="result.tracks.length > 0" class="pb-2 pt-3">
      <router-link :to="{params: {type: 'track'}, query: $route.query}" class="text-muted">
        <div class="d-inline-flex align-items-center">
          <Icon icon="tracks" class="title-color me-2" />
          <span class="section-title">
            Tracks
          </span>
        </div>
      </router-link>
      <TrackList :tracks="result.tracks" />
    </div>
    <EmptyIndicator v-if="!loading && !hasResult && !hasMore" label="No results" />
    <InfiniteLoader :loading="loading" :has-more="hasMore" @load-more="loadMore" />
  </div>
</template>
<script>
  import { defineComponent, inject, ref, computed, watch } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import TrackList from '@/library/track/TrackList.vue'
  import { useRadioStore } from '@/player/radio'
  import { longPressTooltip } from '@/shared/tooltips'

  export default defineComponent({
    components: {
      AlbumList: AlbumList,
      ArtistList: ArtistList,
      TrackList: TrackList,
    },

    directives: {
      'longpress-tooltip': longPressTooltip
    },

    props: {
      /** Search terms. */
      query: { type: String, required: true },
      /** Optional result type filter (album, artist or track). */
      type: { type: String, default: null },
    },

    setup: function (props) {
      var api = inject('$api')
      var radio = useRadioStore()

      /** Search results grouped by media type. */
      var result = ref({
        albums: [],
        artists: [],
        tracks: [],
      })

      var loading = ref(false)
      var offset = ref(0)
      var hasMore = ref(true)

      var key = computed(function () {
        return '' + props.type + props.query
      })

      var hasResult = computed(function () {
        return result.value.albums.length > 0 ||
          result.value.artists.length > 0 ||
          result.value.tracks.length > 0
      })

      watch(key, function () {
        result.value.albums = []
        result.value.artists = []
        result.value.tracks = []
        offset.value = 0
        hasMore.value = true
        loading.value = false
      }, { immediate: true })

      async function loadMore() {
        loading.value = true

        var res = await api.search(props.query, props.type, 20, offset.value)
        var size = res.albums.length + res.artists.length + res.tracks.length

        for (var i = 0; i < res.albums.length; i++) {
          result.value.albums.push(res.albums[i])
        }

        for (var j = 0; j < res.artists.length; j++) {
          result.value.artists.push(res.artists[j])
        }

        for (var k = 0; k < res.tracks.length; k++) {
          result.value.tracks.push(res.tracks[k])
        }

        offset.value += size
        hasMore.value = size >= 20
        loading.value = false
      }

      // Radio functions
      async function radioAlbums() {
        if (!result.value.albums.length) {
          return
        }

        var tracks = []
        var albums = result.value.albums.slice(0, 10)

        for (var i = 0; i < albums.length; i++) {
          var fullAlbum = await api.getAlbumDetails(albums[i].id)

          if (fullAlbum && fullAlbum.tracks && fullAlbum.tracks.length) {
            tracks = radio.takeUpToX(tracks, fullAlbum.tracks)

            if (tracks.length >= 100) {
              break
            }
          }
        }

        if (tracks.length) {
          await radio.playRandomOrTracks({ tracks: tracks })
        }
      }

      async function radioArtists() {
        if (!result.value.artists.length) {
          return
        }

        var tracks = []
        var artists = result.value.artists.slice(0, 10)

        for (var i = 0; i < artists.length; i++) {
          var artistTracks = []
          var iterator = api.getTracksByArtist(artists[i].id)

          while (true) {
            var item = await iterator.next()

            if (item.done) {
              break
            }

            artistTracks = artistTracks.concat(item.value)

            if (artistTracks.length >= 20) {
              if (typeof iterator.return === 'function') {
                await iterator.return()
              }

              break
            }
          }

          tracks = tracks.concat(artistTracks.slice(0, 20))

          if (tracks.length >= 100) {
            break
          }
        }

        if (tracks.length) {
          await radio.playRandomOrTracks({ tracks: tracks })
        }
      }

      return {
        result: result,
        loading: loading,
        offset: offset,
        hasMore: hasMore,
        key: key,
        hasResult: hasResult,
        loadMore: loadMore,
        radioAlbums: radioAlbums,
        radioArtists: radioArtists,
      }
    },
  })
</script>
