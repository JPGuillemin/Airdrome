<template>
  <div class="main-content">
    <h1 class="display-5 fw-bold hero-title">
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

    <AlbumList :items="albums" />
    <EmptyIndicator v-if="!loading && albums.length === 0" />
    <InfiniteLoader :loading="loading" :has-more="hasMore" @load-more="loadAlbums" />
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import AlbumList from './AlbumList.vue'
  import { Album, AlbumSort } from '@/shared/api'
  import { useLoader } from '@/shared/loader'

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
      loadAlbums() {
        this.loading = true
        const loader = useLoader()
        loader.showLoading()
        return this.$api.getAlbums(this.sort as AlbumSort, 50, this.offset).then(albums => {
          this.albums.push(...albums)
          this.offset += albums.length
          this.hasMore = albums.length >= 50
          this.loading = false
          loader.hideLoading()
        })
      }
    }
  })
</script>
<style scoped>
  .hero-title {
    font-size: 1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    display: block;
  }
</style>
