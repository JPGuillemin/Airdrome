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
            title="Genre Radio"
            @click="radio.shuffleGenre(item.id)"
          >
            <Icon icon="radio" />
          </b-button>
        </div>
        <AlbumList :items="item.albums" tile-size="60" title-only allow-h-scroll />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref, computed, watch, inject } from 'vue'
  import { orderBy } from 'lodash-es'
  import AlbumList from '@/library/album/AlbumList.vue'
  import type { Album } from '@/shared/api'
  import { useRadioStore } from '@/player/radio'
  import { useRoute } from 'vue-router'

  interface GenreWithAlbums {
    id: string
    name: string
    albumCount: number
    albums: Album[]
  }

  export default defineComponent({
    components: { AlbumList },
    setup() {
      const api = inject('$api') as any
      const radio = useRadioStore()
      const route = useRoute()
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
            const shuffled = true
            const albums = await api.getAlbumsByGenre(genre.id, 16, 0, shuffled)
            return {
              id: genre.id,
              name: genre.name,
              albumCount: genre.albumCount,
              albums,
            }
          }
          const firstBatch = genres.slice(0, 4)
          const firstItems = await Promise.all(firstBatch.map(createGenreWithAlbums))
          items.value = firstItems

          const rest = genres.slice(4)
          Promise.all(rest.map(createGenreWithAlbums)).then(restItems => {
            items.value.push(...restItems)
          })
        } catch (error) {
          console.error('Failed to load genres or albums:', error)
        } finally {
          loading.value = false
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

      return { items, sortedItems, loading, sort, loadGenres, radio, api }
    }
  })
</script>
