<template>
  <div class="main-content">
    <div v-if="recommendedAlbums.length > 0" class="mb-4">
      <h3>Current mood selection</h3>
      <AlbumList :items="recommendedAlbums" allow-h-scroll />
    </div>

    <div v-if="result.genres.length > 0" class="mb-4">
      <router-link :to="{name: 'genres'}" class="text-muted">
        <h3>Genres</h3>
      </router-link>
      <div
        class="d-flex gap-2 px-2 py-2 px-md-0 flex-nowrap flex-md-wrap overflow-auto overflow-md-visible"
        style="scrollbar-width: none; -ms-overflow-style: none;">
        <span
          v-for="item in result.genres"
          :key="item.id"
          class="text-bg-secondary rounded-pill py-3 px-2 flex-shrink-0 text-truncate text-center align-items-center justify-content-center"
          style="width: 100px;">
          <router-link
            :to="{name: 'genre', params: { id: item.id } }"
            class="text-decoration-none"
            style="color: var(--bs-primary) !important;">
            {{ item.name }}
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

    <div v-if="result.played.length > 0" class="mb-4">
      <router-link :to="{name: 'albums', params: {sort: 'recently-played'}}" class="text-muted">
        <h3>Recently played</h3>
      </router-link>
      <AlbumList :items="result.played" allow-h-scroll />
    </div>

    <EmptyIndicator v-if="empty" />
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import { Album, Genre, Artist } from '@/shared/api'
  import { orderBy, uniq } from 'lodash-es'
  import { useLoader } from '@/shared/loader'

  export default defineComponent({
    components: {
      AlbumList,
      ArtistList,
    },
    data() {
      return {
        loading: true as boolean,
        result: {
          recent: [] as Album[],
          played: [] as Album[],
          random: [] as Album[],
          favalbums: [] as Album[],
          favartists: [] as Artist[],
          genres: [] as Genre[],
        },
        recommendedAlbums: [] as Album[],
      }
    },
    computed: {
      empty() {
        return Object.values(this.result).findIndex(x => x.length > 0) === -1
      },
    },
    async created() {
      const loader = useLoader()
      const size = 18

      loader.showLoading()
      this.loading = true

      try {
        // Fetch all in parallel for consistency
        const [
          recent,
          played,
          random,
          favourites,
          genres,
          recentlyPlayedForMood,
        ] = await Promise.all([
          this.$api.getAlbums('recently-added', size),
          this.$api.getAlbums('recently-played', size),
          this.$api.getAlbums('random', size),
          this.$api.getFavourites(),
          this.$api.getGenres(),
          this.$api.getAlbums('recently-played', 15),
        ])

        // Assign results
        this.result.recent = recent
        this.result.played = played
        this.result.random = random
        this.result.favalbums = favourites.albums.slice(0, size)
        this.result.favartists = favourites.artists.slice(0, size)
        this.result.genres = orderBy(genres, 'albumCount', 'desc')

        // --- Mood-based recommendation logic ---
        const genreCounts: Record<string, number> = {}
        for (const album of recentlyPlayedForMood) {
          const albumGenres = uniq(album.genres?.map(g => g.name) || [])
          for (const genre of albumGenres) {
            genreCounts[genre] = (genreCounts[genre] || 0) + 1
          }
        }
        const sortedGenres = orderBy(
          Object.entries(genreCounts).map(([name, count]) => ({ name, count })),
          ['count'],
          ['desc']
        )
        const topGenres = sortedGenres.slice(0, 2).map(g => g.name)
        const albumsFromGenres: Album[] = []
        await Promise.all(
          topGenres.map(async(genre) => {
            const albums = await this.$api.getAlbumsByGenre(genre, 10)
            albumsFromGenres.push(...albums)
          })
        )
        const uniqueAlbums = Array.from(new Map(albumsFromGenres.map(a => [a.id, a])).values())
        this.recommendedAlbums = uniqueAlbums.sort(() => Math.random() - 0.5).slice(0, 15)
      } catch (error) {
        console.error('Error loading Discover data:', error)
      } finally {
        this.loading = false
        loader.hideLoading()
      }
    },
  })
</script>
