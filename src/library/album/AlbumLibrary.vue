<template>
  <div class="main-content">
    <h1 class="poster-title">
      Albums
    </h1>
    <ul class="nav-underlined mb-3">
      <li>
        <router-link :to="{ ...$route, params: { sort: 'recently-added' } }">
          Recently added
        </router-link>
      </li>
      <li>
        <router-link :to="{ ...$route, params: { sort: 'recently-played' } }">
          Recently played
        </router-link>
      </li>
      <li>
        <router-link :to="{ ...$route, params: { sort: 'most-played' } }">
          Most played
        </router-link>
      </li>
      <li>
        <router-link :to="{ ...$route, params: { sort: 'a-z' } }">
          A-Z
        </router-link>
      </li>
      <li>
        <router-link :to="{ ...$route, params: { sort: 'random' } }">
          Random
        </router-link>
      </li>
    </ul>

    <AlbumList :items="albums" :allow-h-scroll="false" />
    <EmptyIndicator v-if="!loading && albums.length === 0" />
    <InfiniteLoader :loading="loading" :has-more="hasMore" @load-more="loadMore" />
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import AlbumList from './AlbumList.vue'
  import { Album, AlbumSort } from '@/shared/api'

  export default defineComponent({
    components: { AlbumList },
    props: { sort: { type: String, required: true } },
    data() {
      return {
        albums: [] as | Album[],
        loading: true,
        offset: 0 as number,
        hasMore: true,
      }
    },
    watch: {
      sort: {
        handler() {
          this.albums = []
          this.offset = 0
          this.hasMore = true
        }
      }
    },
    methods: {
      loadMore() {
        this.loading = true
        return this.$api.getAlbums(this.sort as AlbumSort, 30, this.offset).then(albums => {
          this.albums.push(...albums)
          this.offset += albums.length
          this.hasMore = albums.length >= 30
          this.loading = false
        })
      }
    }
  })
</script>
<style scoped>
  .poster-title {
    margin-top: 10px;
    font-size: 1.5rem;
  }
</style>
