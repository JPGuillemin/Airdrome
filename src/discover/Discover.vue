<template>
  <div class="main-content">
    <div v-if="result.genres.length > 0" class="section-wrapper pt-3">
      <div class="d-flex gap-3 overflow-auto custom-scroll">
        <router-link
          v-for="item in result.genres"
          :key="item.id"
          :to="{ name: 'genre', params: { id: item.id } }"
          class="text-decoration-none"
          style="color: var(--theme-text-muted); white-space: nowrap; font-weight: bold;"
        >
          {{ item.name }}
        </router-link>
      </div>
    </div>

    <div v-if="result.playlists.length > 0" class="section-wrapper">
      <router-link :to="{ name: 'playlists' }" class="d-inline-flex align-items-center">
        <Icon icon="playlist" class="title-color me-2" />
        <span class="section-title">
          Playlists
        </span>
      </router-link>
      <PlaylistList :items="result.playlists" tile-size="90" allow-h-scroll />
    </div>

    <div v-if="result.recent.length > 0" class="section-wrapper">
      <router-link :to="{ name: 'albums', params: { sort: 'recently-added' } }" class="d-inline-flex align-items-center">
        <Icon icon="new" class="title-color me-2" />
        <span class="section-title">
          Recently added
        </span>
      </router-link>
      <AlbumList :items="result.recent" tile-size="60" allow-h-scroll title-only twin-rows />
    </div>

    <div v-if="result.favartists.length > 0" class="section-wrapper">
      <router-link :to="{ name: 'favourites', params: { section: 'artists' } }" class="d-inline-flex align-items-center">
        <Icon icon="heart" class="title-color me-2" />
        <span class="section-title">
          Fav artists
        </span>
      </router-link>
      <ArtistList :items="result.favartists" tile-size="90" allow-h-scroll />
    </div>

    <div v-if="result.favalbums.length > 0" class="section-wrapper">
      <router-link :to="{ name: 'favourites' }" class="d-inline-flex align-items-center">
        <Icon icon="heart" class="title-color me-2" />
        <span class="section-title">
          Fav albums
        </span>
      </router-link>
      <AlbumList :items="result.favalbums" tile-size="90" allow-h-scroll />
    </div>

    <div v-if="result.random.length > 0" class="section-wrapper">
      <router-link :to="{ name: 'albums', params: { sort: 'random' } }" class="d-inline-flex align-items-center">
        <Icon icon="random" class="title-color me-2" />
        <span class="section-title">
          Random
        </span>
      </router-link>
      <AlbumList :items="result.random" tile-size="60" allow-h-scroll title-only twin-rows />
    </div>

    <div v-if="result.played.length > 0" class="section-wrapper">
      <router-link :to="{ name: 'albums', params: { sort: 'recently-played' } }" class="d-inline-flex align-items-center">
        <Icon icon="recent" class="title-color me-2" />
        <span class="section-title">
          Recently played
        </span>
      </router-link>
      <AlbumList :items="result.played" tile-size="90" allow-h-scroll />
    </div>

    <div v-if="result.recent.length > 0" class="section-wrapper">
      <router-link :to="{ name: 'albums', params: { sort: 'most-played' } }" class="d-inline-flex align-items-center">
        <Icon icon="most" class="title-color me-2" />
        <span class="section-title">
          Most Played
        </span>
      </router-link>
      <AlbumList :items="result.most" tile-size="90" allow-h-scroll />
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref, computed, onMounted, inject } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import PlaylistList from '@/library/playlist/PlaylistList.vue'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import { Album, Genre, Artist, Playlist } from '@/shared/api'
  import { orderBy } from 'lodash-es'

  export default defineComponent({
    components: {
      AlbumList,
      ArtistList,
      PlaylistList,
    },

    setup() {
      const api = inject('$api') as any

      const loading = ref(false)
      const result = ref({
        recent: [] as Album[],
        played: [] as Album[],
        random: [] as Album[],
        most: [] as Album[],
        favalbums: [] as Album[],
        favartists: [] as Artist[],
        genres: [] as Genre[],
        playlists: [] as Playlist[],
      })

      const empty = computed(() =>
        Object.values(result.value).findIndex(x => x.length > 0) === -1
      )

      const fetchData = async() => {
        if (loading.value) return
        loading.value = true
        try {
          const playlists = await api.getPlaylists()
          result.value.playlists = playlists.slice(0, 10)

          api.getAlbums('recently-added', 32).then(recent => {
            result.value.recent = recent
          })

          api.getFavourites().then(favourites => {
            result.value.favartists = favourites.artists.slice(0, 16)
            result.value.favalbums = favourites.albums.slice(0, 16)
          })

          api.getGenres().then((genres: Genre[]) => {
            const genreNames = genres.map((genre: Genre) => ({ ...genre, id: genre.name }))
            result.value.genres = orderBy(genreNames, 'albumCount', 'desc')
          })

          api.getAlbums('random', 32).then(random => {
            result.value.random = random
          })

          api.getAlbums('recently-played', 32).then(played => {
            result.value.played = played
          })

          api.getAlbums('most-played', 32).then(most => {
            result.value.most = most
          })
        } finally {
          loading.value = false
        }
      }

      onMounted(fetchData)

      return {
        result,
        loading,
        empty,
        fetchData,
      }
    },
  })
</script>

<style scoped>
  .header-title {
    margin-top: 10px;
    font-size: 1.5rem;
  }
</style>
