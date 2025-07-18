<template>
  <div class="main-content">
    <ul class="nav-underlined mb-3">
      <li v-for="{ value, text } in options" :key="value">
        <router-link :to="{... $route, params: {... $route.params, sort: value }}">
          {{ text }}
        </router-link>
      </li>
    </ul>
    <AlbumList :items="albums" />
    <EmptyIndicator v-if="!loading && albums.length === 0" />
    <InfiniteLoader :loading="loading" :has-more="hasMore" @load-more="loadMore" />
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import AlbumList from './AlbumList.vue'
  import { Album, AlbumSort } from '@/shared/api'

  export default defineComponent({
    components: {
      AlbumList,
    },
    props: {
      sort: { type: String, required: true },
    },
    data() {
      return {
        albums: [] as | Album[],
        loading: true,
        offset: 0 as number,
        hasMore: true,
      }
    },
    computed: {
      options() {
        return [
          { text: 'Recently added', value: 'recently-added' },
          { text: 'Recently played', value: 'recently-played' },
          { text: 'Most played', value: 'most-played' },
          { text: 'A-Z', value: 'a-z' },
          { text: 'Random', value: 'random' },
        ]
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
        return this.$api.getAlbums(this.sort as AlbumSort, 50, this.offset).then(albums => {
          this.albums.push(...albums)
          this.offset += albums.length
          this.hasMore = albums.length >= 50
          this.loading = false
        })
      }
    }
  })
</script>
