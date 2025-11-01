<template>
  <div class="main-content">
    <div v-if="result.played.length > 0" class="mb-4">
      <router-link :to="{name: 'albums', params: {sort: 'recently-played'}}" class="text-muted">
        <h3>Recently played</h3>
      </router-link>
      <AlbumList :items="result.played" allow-h-scroll />
    </div>
    <div v-if="result.genres.length > 0" class="mb-4">
      <router-link :to="{ name: 'genres' }" class="text-muted">
        <h3>Genres</h3>
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
            <img :src="item.cover" alt="" class="genre-icon">
            <span class="text-truncate">{{ item.name }}</span>
          </router-link>
        </span>
      </div>
    </div>

    <div v-if="result.favartists.length > 0" class="mb-4">
      <router-link :to="{name: 'favourites', params: { section: 'artists' }}" class="text-muted">
        <h3>Fav artists</h3>
      </router-link>
      <ArtistList :items="result.favartists" allow-h-scroll />
    </div>

    <div v-if="result.favalbums.length > 0" class="mb-4">
      <router-link :to="{name: 'favourites'}" class="text-muted">
        <h3>Fav albums</h3>
      </router-link>
      <AlbumList :items="result.favalbums" allow-h-scroll />
    </div>

    <div v-if="result.random.length > 0" class="mb-4">
      <router-link :to="{name: 'albums', params: {sort: 'random'}}" class="text-muted">
        <h3>Random</h3>
      </router-link>
      <AlbumList :items="result.random" allow-h-scroll />
    </div>

    <div v-if="result.recent.length > 0" class="mb-4">
      <router-link :to="{name: 'albums', params: {sort: 'recently-added'}}" class="text-muted">
        <h3>Recently added</h3>
      </router-link>
      <AlbumList :items="result.recent" allow-h-scroll />
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import { Album, Genre, Artist } from '@/shared/api'
  import { orderBy } from 'lodash-es'
  import { useLoader } from '@/shared/loader'
  import fallbackImage from '@/shared/assets/fallback.svg'

  export default defineComponent({
    components: {
      AlbumList,
      ArtistList,
    },
    data() {
      return {
        loading: true,
        loaded: false,
        result: {
          recent: [] as Album[],
          played: [] as Album[],
          random: [] as Album[],
          favalbums: [] as Album[],
          favartists: [] as Artist[],
          genres: [] as Genre[],
        },
      }
    },
    computed: {
      empty() {
        return Object.values(this.result).findIndex(x => x.length > 0) === -1
      },
    },
    mounted() {
      if (!this.loaded) this.fetchData()
    },
    activated() {
      if (!this.loaded) this.fetchData()
    },
    methods: {
      async fetchData() {
        const loader = useLoader()
        const size = 18
        loader.showLoading()
        this.loading = true

        try {
          const [
            recent,
            played,
            random,
            favourites,
            genres,
          ] = await Promise.all([
            this.$api.getAlbums('recently-added', size),
            this.$api.getAlbums('recently-played', size),
            this.$api.getAlbums('random', size),
            this.$api.getFavourites(),
            this.$api.getGenres(),
            this.$api.getAlbums('recently-played', 15),
          ])

          const genresWithCovers = await Promise.all(
            genres.map(async(genre: Genre) => {
              try {
                const albums = await this.$api.getAlbumsByGenre(genre.name, 1)
                const cover = albums[0]?.image || fallbackImage
                return { ...genre, id: genre.name, cover }
              } catch {
                return { ...genre, id: genre.name, cover: fallbackImage }
              }
            })
          )

          this.result.recent = recent
          this.result.played = played
          this.result.random = random
          this.result.favalbums = favourites.albums.slice(0, size)
          this.result.favartists = favourites.artists.slice(0, size)
          this.result.genres = orderBy(genresWithCovers, 'albumCount', 'desc')

          this.loaded = true
          console.info('loaded = ', this.loaded)
        } catch (error) {
          console.error('Error loading Discover data:', error)
        } finally {
          this.loading = false
          loader.hideLoading()
        }
      },
    },
  })
</script>

<style scoped>
  .genre-icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }
</style>
