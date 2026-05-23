// GenreLibrary.vue
<template>
  <div class="main-content">
    <div class="d-flex align-items-center justify-content-between mt-3">
      <div class="d-inline-flex align-items-center">
        <Icon icon="genres" class="title-color me-2" />
        <span class="main-title">
          Genres
        </span>
      </div>
      <ul class="nav adapt-text">
        <li>
          <router-link :to="{ ... $route, params: { sort: 'size' }}">
            <Icon icon="most" />
          </router-link>
        </li>
        <li>
          <router-link :to="{ ... $route, params: { sort: 'a-z' }}">
            A-z
          </router-link>
        </li>
        <li>
          <router-link :to="{ ...$route, params: { sort: 'cloud' } }">
            <Icon icon="cloud" />
          </router-link>
        </li>
      </ul>
    </div>
    <div v-if="sortedItems.length > 0">
      <!-- CLOUD MODE -->
      <GenreCloud
        v-if="sort === 'cloud'"
        :items="sortedItems"
      />

      <!-- NORMAL MODE -->
      <template v-else>
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
                {{ item.name }} - {{ item.albumCount }}
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

          <ArtistList
            :items="item.artists"
            :allow-h-scroll="true"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref, computed, watch, inject } from 'vue'
  import { orderBy } from 'lodash-es'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import GenreCloud from './GenreCloud.vue'
  import type { Artist } from '@/shared/api'
  import { useRadioStore } from '@/player/radio'
  import { useRoute } from 'vue-router'

  interface GenreWithArtists {
    id: string
    name: string
    albumCount: number
    artists: Artist[]
  }

  export default defineComponent({
    components: { ArtistList, GenreCloud },
    setup() {
      const api = inject('$api') as any
      const radio = useRadioStore()
      const route = useRoute()
      const items = ref<GenreWithArtists[]>([])
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

          // CLOUD MODE = metadata only
          if (sort.value === 'cloud') {
            items.value = genres.map((genre: any) => ({
              id: genre.id,
              name: genre.name,
              albumCount: genre.albumCount,
              artists: [],
            }))

            return
          }

          const createGenreWithArtists = async(genre: any) => {
            const artists = await api.getArtistsByGenre(
              genre.id,
              16,
              0
            )

            return {
              id: genre.id,
              name: genre.name,
              albumCount: genre.albumCount,
              artists,
            }
          }

          const firstBatch = genres.slice(0, 4)

          const firstItems = await Promise.all(
            firstBatch.map(createGenreWithArtists)
          )

          items.value = firstItems

          const rest = genres.slice(4)

          Promise.all(rest.map(createGenreWithArtists))
            .then(restItems => {
              items.value.push(...restItems)
            })

        } catch (error) {
          console.error('Failed to load genres or artists:', error)
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
