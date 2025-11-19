<template>
  <div class="main-content">
    <h1 class="custom-title mt-3">
      Genres
    </h1>
    <ul class="nav-underlined mb-3">
      <li>
        <router-link :to="{ ...$route, params: { sort: null } }">
          Most albums
        </router-link>
      </li>
      <li>
        <router-link :to="{ ...$route, params: { sort: 'a-z' } }">
          A-Z
        </router-link>
      </li>
    </ul>
    <div v-if="sortedItems.length > 0" class="d-flex flex-wrap justify-content-center gap-2 px-2 py-2 px-md-0">
      <span
        v-for="item in sortedItems"
        :key="item.id"
        class="text-bg-secondary rounded-pill py-3 px-2 text-truncate text-center d-flex align-items-center justify-content-center gap-2"
        style="width: 160px;"
      >
        <router-link
          :to="{ name: 'genre', params: { id: item.id } }"
          class="text-decoration-none d-flex align-items-center gap-2"
          style="color: var(--bs-primary) !important;"
        >
          <img :src="item.cover" alt="" class="genre-icon">
          <span class="text-truncate">{{ item.name }}</span>
        </router-link>
      </span>
    </div>
    <EmptyIndicator v-else />
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { orderBy } from 'lodash-es'
  import fallbackImage from '@/shared/assets/fallback.svg'

  export default defineComponent({
    props: { sort: { type: String, default: null } },
    data() {
      return {
        items: [] as any[],
        loading: true,
      }
    },
    computed: {
      sortedItems(): any[] {
        return this.sort === 'a-z'
          ? orderBy(this.items, 'name')
          : orderBy(this.items, 'albumCount', 'desc')
      },
    },
    watch: {
      '$route.params.sort': {
        immediate: true,
        handler() {
          this.loadGenres()
        },
      },
    },
    methods: {
      async loadGenres() {
        this.loading = true
        const genres = await this.$api.getGenres()
        const genresWithCovers = await Promise.all(
          genres.map(async(genre: any) => {
            const albums = await this.$api.getAlbumsByGenre(genre.id, 1)
            const cover = albums[0]?.image || fallbackImage
            return { ...genre, cover }
          })
        )
        this.loading = false
        this.items = genresWithCovers
      },
    },
  })
</script>
<style scoped>
  .genre-icon {
    width: 32px;
    height: 32px;
    object-fit: cover;
    border-radius: 50%;
    flex-shrink: 0;
  }
</style>
