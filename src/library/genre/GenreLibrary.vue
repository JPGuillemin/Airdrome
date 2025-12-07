<template>
  <div class="main-content">
    <div class="d-flex align-items-center justify-content-between my-3">
      <h1 class="main-title">
        Genres
      </h1>
      <ul class="nav-underlined adapt-text">
        <li>
          <router-link :to="{ ... $route, params: {} }">
            Most albums
          </router-link>
        </li>
        <li>
          <router-link :to="{ ... $route, params: { sort: 'a-z' } }">
            A-Z
          </router-link>
        </li>
      </ul>
    </div>
    <div v-if="sortedItems.length > 0">
      <div
        v-for="item in sortedItems"
        :key="item.id"
        class="section-wrapper"
      >
        <div class="d-flex align-items-center justify-content-between">
          <router-link
            :to="{ name: 'genre', params: { id: item.id } }"
            class="header-title"
          >
            {{ item.name }}
          </router-link>
          <b-button
            variant="transparent"
            class="me-2"
            title="Radio"
            @click="shuffleNow(item.id)"
          >
            <Icon icon="radio" />
          </b-button>
        </div>
        <AlbumList :items="item.albums" allow-h-scroll />
      </div>
    </div>

    <EmptyIndicator v-else />
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { orderBy } from 'lodash-es'
  import type { Album } from '@/shared/api'
  import AlbumList from '@/library/album/AlbumList.vue'
  import { useLoader } from '@/shared/loader'
  import { usePlayerStore } from '@/player/store'

  interface GenreWithAlbums {
    id: string
    name: string
    albumCount: number
    albums: Album[]
  }

  export default defineComponent({
    components: {
      AlbumList,
    },
    setup() {
      return {
        playerStore: usePlayerStore(),
      }
    },
    data() {
      return {
        items: [] as GenreWithAlbums[],
        loading: true,
        sort: this.$route.params.sort || null,
      }
    },
    computed: {
      sortedItems(): GenreWithAlbums[] {
        if (!this.items.length) return []
        return this.sort === 'a-z'
          ? orderBy(this.items, 'name')
          : orderBy(this.items, 'albumCount', 'desc')
      },
    },
    watch: {
      '$route.params.sort': {
        immediate: true,
        handler(newSort) {
          this.sort = newSort || null
          this.loadGenres()
        },
      },
    },
    methods: {
      async loadGenres() {
        this.loading = true
        const loader = useLoader()
        loader.showLoading()
        try {
          const genres = await this.$api.getGenres()
          const genresWithAlbums = await Promise.all(
            genres.map(async(genre: any) => {
              const albums = (await this.$api.getAlbumsByGenre(
                genre.id,
                15
              )) as Album[]
              return {
                id: genre.id,
                name: genre.name,
                albumCount: genre.albumCount,
                albums,
              }
            })
          )
          this.items = genresWithAlbums
        } catch (error) {
          console.error('Failed to load genres or albums:', error)
        } finally {
          this.loading = false
          loader.hideLoading()
        }
      },
      async shuffleNow(id): Promise<void> {
        const loader = useLoader()
        loader.showLoading()
        await new Promise(resolve => setTimeout(resolve, 0))
        let shouldRoute = false
        try {
          const tracks = await this.$api.getRandomTracks({
            genre: id,
            size: 200,
          })
          if (!tracks.length) return
          await this.playerStore.playNow(tracks)
          shouldRoute = true
        } finally {
          loader.hideLoading()
          if (shouldRoute) {
            this.$nextTick(() => {
              this.$router.push({ name: 'queue' })
            })
          }
        }
      },
    },
  })
</script>
