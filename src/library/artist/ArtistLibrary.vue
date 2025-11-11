<template>
  <div class="main-content">
    <h1 class=" poster-title">
      Artists
    </h1>

    <ul class="nav-underlined mb-3">
      <li>
        <router-link :to="{ ...$route, params: { ...$route.params, sort: null } }">
          Most albums
        </router-link>
      </li>
      <li>
        <router-link :to="{ ...$route, params: { ...$route.params, sort: 'a-z' } }">
          A-Z
        </router-link>
      </li>
    </ul>

    <ArtistList :items="visibleArtists" />
    <EmptyIndicator v-if="!loading && visibleArtists.length === 0" />
    <InfiniteLoader :loading="loading" :has-more="hasMore" @load-more="loadMore" />
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { orderBy } from 'lodash-es'
  import ArtistList from './ArtistList.vue'
  import { Artist } from '@/shared/api'

  export default defineComponent({
    components: { ArtistList },
    props: { sort: { type: String, default: null } },
    data() {
      return {
        loading: true,
        allArtists: [] as Artist[],
        visibleArtists: [] as Artist[],
        chunkSize: 30,
        nextIndex: 0,
        hasMore: true,
      }
    },
    computed: {
      sortedAll(): Artist[] {
        return this.sort === 'a-z'
          ? orderBy(this.allArtists, 'name')
          : orderBy(this.allArtists, 'albumCount', 'desc')
      },
    },
    watch: {
      sort: {
        immediate: true,
        handler() {
          this.reset()
          this.fetchArtists()
        },
      },
    },
    methods: {
      reset() {
        this.loading = true
        this.allArtists = []
        this.visibleArtists = []
        this.nextIndex = 0
        this.hasMore = true
      },
      async fetchArtists() {
        try {
          const result = await this.$api.getArtists()
          this.allArtists = result
          this.appendNextChunk()
        } finally {
          this.loading = false
        }
      },
      loadMore() {
        this.appendNextChunk()
      },
      appendNextChunk() {
        const sorted = this.sortedAll
        const nextChunk = sorted.slice(this.nextIndex, this.nextIndex + this.chunkSize)
        this.visibleArtists.push(...nextChunk)
        this.nextIndex += nextChunk.length
        this.hasMore = this.nextIndex < sorted.length
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
