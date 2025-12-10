<template>
  <div class="main-content">
    <div class="d-flex align-items-center justify-content-between my-3">
      <div class="d-inline-flex align-items-center">
        <Icon icon="genres" class="title-color me-2" />
        <span class="main-title">
          Genres
        </span>
      </div>
      <ul class="nav adapt-text">
        <li>
          <router-link :to="{ ... $route, params: {} }">
            <Icon icon="most" />
          </router-link>
        </li>
        <li>
          <router-link :to="{ ... $route, params: { sort: 'a-z' } }">
            A-z
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
            class="d-inline-flex align-items-center"
          >
            <span class="section-title">
              {{ item.name }}  -  {{ item.albumCount }}
            </span>
            <Icon icon="albums" class="title-color xsmall ms-1" />
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
        this.items = []
        try {
          const genres = await this.$api.getGenres()
          const createGenreWithAlbums = async(genre: any) => {
            const albums = await this.$api.getAlbumsByGenre(genre.id, 15)
            return {
              id: genre.id,
              name: genre.name,
              albumCount: genre.albumCount,
              albums,
            }
          }
          // Load first 3 genres
          const firstBatch = genres.slice(0, 3)
          const firstItems = await Promise.all(
            firstBatch.map(createGenreWithAlbums)
          )
          // render immediately
          this.items = firstItems
          // Load the rest in background
          const rest = genres.slice(3)
          Promise.all(
            rest.map(createGenreWithAlbums)
          ).then((restItems) => {
            this.items.push(...restItems)
          })
        } catch (error) {
          console.error('Failed to load genres or albums:', error)
        } finally {
          this.loading = false
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
