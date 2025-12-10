<template>
  <div class="main-content">
    <div class="d-flex align-items-center justify-content-between my-3">
      <div class="d-inline-flex align-items-center">
        <Icon icon="albums" class="title-color me-2" />
        <span class="main-title">
          Albums
        </span>
      </div>
      <ul class="nav adapt-text">
        <li>
          <router-link :to="{ ...$route, params: { sort: 'recently-added' } }">
            <Icon icon="new" />
          </router-link>
        </li>
        <li>
          <router-link :to="{ ...$route, params: { sort: 'most-played' } }">
            <Icon icon="most" />
          </router-link>
        </li>
        <li>
          <router-link :to="{ ...$route, params: { sort: 'recently-played' } }">
            <Icon icon="recent" />
          </router-link>
        </li>
        <li>
          <router-link :to="{ ...$route, params: { sort: 'a-z' } }">
            A-z
          </router-link>
        </li>
        <li>
          <router-link :to="{ ...$route, params: { sort: 'random' } }">
            <Icon icon="random" />
          </router-link>
        </li>
      </ul>
    </div>
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
    props: { sort: { type: String, default: 'recently-added' } },
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
