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
  import { defineComponent, ref, computed, watch, inject, nextTick } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { orderBy } from 'lodash-es'
  import AlbumList from '@/library/album/AlbumList.vue'
  import { useLoader } from '@/shared/loader'
  import { usePlayerStore } from '@/player/store'
  import type { Album } from '@/shared/api'

  interface GenreWithAlbums {
    id: string
    name: string
    albumCount: number
    albums: Album[]
  }

  export default defineComponent({
    components: { AlbumList },
    setup() {
      const playerStore = usePlayerStore()
      const api = inject('$api') as any
      const route = useRoute()
      const router = useRouter()

      const items = ref<GenreWithAlbums[]>([])
      const loading = ref(true)
      const sort = ref<string | null>(route.params.sort as string || null)

      const sortedItems = computed(() => {
        if (!items.value.length) return []
        return sort.value === 'a-z'
          ? orderBy(items.value, 'name')
          : orderBy(items.value, 'albumCount', 'desc')
      })

      const loadGenres = async() => {
        loading.value = true
        items.value = []
        try {
          const genres = await api.getGenres()
          const createGenreWithAlbums = async(genre: any) => {
            const albums = await api.getAlbumsByGenre(genre.id, 15)
            return {
              id: genre.id,
              name: genre.name,
              albumCount: genre.albumCount,
              albums,
            }
          }
          const firstBatch = genres.slice(0, 3)
          const firstItems = await Promise.all(firstBatch.map(createGenreWithAlbums))
          items.value = firstItems

          const rest = genres.slice(3)
          Promise.all(rest.map(createGenreWithAlbums)).then(restItems => {
            items.value.push(...restItems)
          })
        } catch (error) {
          console.error('Failed to load genres or albums:', error)
        } finally {
          loading.value = false
        }
      }

      const shuffleNow = async(id: string) => {
        const loader = useLoader()
        loader.showLoading()
        await new Promise(resolve => setTimeout(resolve, 0))
        let shouldRoute = false
        try {
          const tracks = await api.getRandomTracks({
            genre: id,
            size: 200,
          })
          if (!tracks.length) return
          await playerStore.playNow(tracks)
          shouldRoute = true
        } finally {
          loader.hideLoading()
          if (shouldRoute) {
            nextTick(() => {
              router.push({ name: 'queue' })
            })
          }
        }
      }

      watch(
        () => route.params.sort,
        (newSort) => {
          sort.value = newSort as string || null
          loadGenres()
        },
        { immediate: true }
      )

      return { items, sortedItems, loading, sort, loadGenres, shuffleNow, playerStore, api }
    }
  })
</script>
