<template>
  <div class="main-content">
    <div v-if="result.playlists.length > 0" class="mb-4">
      <router-link :to="{ name: 'playlists' }" class="text-muted">
        <h1 class="poster-title">
          Playlists
        </h1>
      </router-link>
      <PlaylistList :items="result.playlists" allow-h-scroll />
    </div>

    <div v-if="result.played.length > 0" class="mb-4">
      <router-link :to="{ name: 'albums', params: { sort: 'recently-played' } }" class="text-muted">
        <h1 class=" poster-title">
          Recently played
        </h1>
      </router-link>
      <AlbumList :items="result.played" allow-h-scroll />
    </div>

    <div v-if="result.genres.length > 0" class="mb-4">
      <router-link :to="{ name: 'genres' }" class="text-muted">
        <h1 class="poster-title">
          Genres
        </h1>
      </router-link>
      <div
        class="d-flex gap-2 px-2 py-2 px-md-0 flex-nowrap flex-md-wrap overflow-auto overflow-md-visible"
        style="scrollbar-width: none; -ms-overflow-style: none;"
      >
        <span
          v-for="item in result.genres"
          :key="item.id"
          class="text-bg-secondary rounded-pill py-3 px-2 flex-shrink-0 text-truncate text-center align-items-center justify-content-center d-flex"
          style="width: 150px;"
        >
          <router-link
            :to="{ name: 'genre', params: { id: item.id } }"
            class="text-decoration-none d-flex align-items-center gap-2 w-100 justify-content-center"
            style="color: var(--bs-primary) !important;"
          >
            <span class="text-truncate">{{ item.name }}</span>
          </router-link>
        </span>
      </div>
    </div>

    <div v-if="result.favartists.length > 0" class="mb-4">
      <router-link :to="{ name: 'favourites', params: { section: 'artists' } }" class="text-muted">
        <h1 class="poster-title">
          Fav artists
        </h1>
      </router-link>
      <ArtistList :items="result.favartists" allow-h-scroll />
    </div>

    <div v-if="result.favalbums.length > 0" class="mb-4">
      <router-link :to="{ name: 'favourites' }" class="text-muted">
        <h1 class="poster-title">
          Fav albums
        </h1>
      </router-link>
      <AlbumList :items="result.favalbums" allow-h-scroll />
    </div>

    <div v-if="result.random.length > 0" class="mb-4">
      <router-link :to="{ name: 'albums', params: { sort: 'random' } }" class="text-muted">
        <h1 class=" poster-title">
          Random
        </h1>
      </router-link>
      <AlbumList :items="result.random" allow-h-scroll />
    </div>

    <div v-if="result.recent.length > 0" class="mb-4">
      <router-link :to="{ name: 'albums', params: { sort: 'recently-added' } }" class="text-muted">
        <h1 class=" poster-title">
          Recently added
        </h1>
      </router-link>
      <AlbumList :items="result.recent" allow-h-scroll />
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
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
    data() {
      return {
        loading: false,
        result: {
          recent: [] as Album[],
          played: [] as Album[],
          random: [] as Album[],
          favalbums: [] as Album[],
          favartists: [] as Artist[],
          genres: [] as Genre[],
          playlists: [] as Playlist[],
        },
      }
    },
    computed: {
      empty() {
        return Object.values(this.result).findIndex(x => x.length > 0) === -1
      },
    },
    mounted() {
      this.fetchData()
    },
    methods: {
      async fetchData() {
        const size = 15
        if (this.loading) return
        this.loading = true
        try {
          const [recent, played, random, favourites, genres, playlists] = await Promise.all([
            this.$api.getAlbums('recently-added', size),
            this.$api.getAlbums('recently-played', size),
            this.$api.getAlbums('random', size),
            this.$api.getFavourites(),
            this.$api.getGenres(),
            this.$api.getPlaylists(),
          ])

          const genreNames = genres.map((genre: Genre) => ({
            ...genre,
            id: genre.name,
          }))

          this.result.recent = recent
          this.result.played = played
          this.result.random = random
          this.result.favalbums = favourites.albums.slice(0, size)
          this.result.favartists = favourites.artists.slice(0, size)
          this.result.genres = orderBy(genreNames, 'albumCount', 'desc')
          this.result.playlists = playlists.slice(0, size)
        } finally {
          this.loading = false
        }
      },
    },
  })
</script>

<style scoped>
  .poster-title {
    margin-top: 10px;
    font-size: 1.5rem;
  }
</style>
