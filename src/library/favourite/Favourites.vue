// Favourites.vue
<template>
  <div v-if="details" class="main-content">
    <div class="d-flex align-items-center justify-content-between my-3">
      <div class="d-inline-flex align-items-center">
        <Icon icon="heart" class="title-color me-2" />
        <span class="main-title">
          Favourites
        </span>
      </div>
      <ul class="nav adapt-text">
        <li>
          <router-link :to="albumsRoute">
            <Icon icon="albums" />
          </router-link>
        </li>
        <li>
          <router-link :to="artistsRoute">
            <Icon icon="artists" />
          </router-link>
        </li>
        <li>
          <router-link :to="tracksRoute">
            <Icon icon="tracks" />
          </router-link>
        </li>
      </ul>
    </div>
    <template v-if="section === 'artists'">
      <ArtistList v-if="details.artists.length > 0" :items="details.artists" :allow-h-scroll="false" />
      <EmptyIndicator v-else />
    </template>
    <template v-else-if="section === 'tracks'">
      <TrackList v-if="details.tracks.length > 0" :tracks="details.tracks" />
      <EmptyIndicator v-else />
    </template>
    <template v-else>
      <AlbumList v-if="details.albums.length > 0" :items="details.albums" :allow-h-scroll="false" />
      <EmptyIndicator v-else />
    </template>
  </div>
</template>
<script>
  import { defineComponent, ref, watch, inject, computed } from 'vue'
  import { useRoute } from 'vue-router'
  import AlbumList from '@/library/album/AlbumList.vue'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import TrackList from '@/library/track/TrackList.vue'
  import { useFavouriteStore } from '@/library/favourite/store'

  export default defineComponent({
    components: {
      AlbumList: AlbumList,
      ArtistList: ArtistList,
      TrackList: TrackList,
    },

    props: {
      /** Favourites section to display (albums, artists or tracks). */
      section: { type: String, default: '' },
    },

    setup: function () {
      var api = inject('$api')
      var route = useRoute()
      var favouriteStore = useFavouriteStore()

      /** Favourites grouped by media type, null while loading. */
      var details = ref(null)

      // Route objects used by the section links in the header.
      var albumsRoute = computed(function () {
        return Object.assign({}, route, { params: { section: 'albums' } })
      })

      var artistsRoute = computed(function () {
        return Object.assign({}, route, { params: { section: 'artists' } })
      })

      var tracksRoute = computed(function () {
        return Object.assign({}, route, { params: { section: 'tracks' } })
      })

      watch(
        function () {
          return [favouriteStore]
        },
        async function () {
          var result = await api.getFavourites()

          details.value = {
            albums: result.albums.filter(function (item) {
              return favouriteStore.albums[item.id]
            }),
            artists: result.artists.filter(function (item) {
              return favouriteStore.artists[item.id]
            }),
            tracks: result.tracks.filter(function (item) {
              return favouriteStore.tracks[item.id]
            }),
          }
        },
        { deep: true, immediate: true }
      )

      return {
        details: details,
        albumsRoute: albumsRoute,
        artistsRoute: artistsRoute,
        tracksRoute: tracksRoute,
      }
    },
  })
</script>
