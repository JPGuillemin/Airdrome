<template>
  <div class="main-content">
    <div class="d-flex align-items-center justify-content-between my-3">
      <div class="d-inline-flex align-items-center">
        <Icon icon="artists" class="title-color me-2" />
        <span class="main-title">
          Artists
        </span>
      </div>
      <ul class="nav adapt-text">
        <li>
          <router-link :to="{ ... $route, params: {} }">
            <Icon icon="most" />
          </router-link>
        </li>
        <li>
          <router-link :to="{ ... $route, params: { ... $route.params, sort: 'a-z' } }">
            A-z
          </router-link>
        </li>
      </ul>
    </div>
    <ArtistList :items="visibleArtists" tile-size="120" :allow-h-scroll="false" />
    <EmptyIndicator v-if="!loading && visibleArtists.length === 0" />
    <InfiniteLoader :loading="loading" :has-more="hasMore" @load-more="loadMore" />
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref, computed, watch, inject } from 'vue'
  import { orderBy } from 'lodash-es'
  import ArtistList from './ArtistList.vue'
  import { Artist } from '@/shared/api'

  export default defineComponent({
    components: { ArtistList },
    props: { sort: { type: String, default: null } },

    setup(props) {
      const api = inject('$api') as any

      const loading = ref(true)
      const allArtists = ref<Artist[]>([])
      const visibleArtists = ref<Artist[]>([])
      const chunkSize = ref(15)
      const nextIndex = ref(0)
      const hasMore = ref(true)

      const sortedAll = computed(() => {
        return props.sort === 'a-z'
          ? orderBy(allArtists.value, 'name')
          : orderBy(allArtists.value, 'albumCount', 'desc')
      })

      const reset = () => {
        loading.value = true
        allArtists.value = []
        visibleArtists.value = []
        nextIndex.value = 0
        hasMore.value = true
      }

      const appendNextChunk = () => {
        const sorted = sortedAll.value
        const nextChunk = sorted.slice(nextIndex.value, nextIndex.value + chunkSize.value)
        visibleArtists.value.push(...nextChunk)
        nextIndex.value += nextChunk.length
        hasMore.value = nextIndex.value < sorted.length
      }

      const fetchArtists = async() => {
        try {
          const result = await api.getArtists()
          allArtists.value = result
          appendNextChunk()
        } finally {
          loading.value = false
        }
      }

      const loadMore = () => {
        appendNextChunk()
      }

      watch(
        () => props.sort,
        () => {
          reset()
          fetchArtists()
        },
        { immediate: true }
      )

      return {
        loading,
        allArtists,
        visibleArtists,
        chunkSize,
        nextIndex,
        hasMore,
        sortedAll,
        reset,
        appendNextChunk,
        fetchArtists,
        loadMore,
      }
    },
  })
</script>
