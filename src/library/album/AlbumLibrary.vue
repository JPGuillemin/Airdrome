<template>
  <div class="main-content">
    <ul class="nav-underlined mb-3">
      <li>
        <router-link :to="{... $route, params: {... $route.params, sort: 'recently-added' }}">
          Recently added
        </router-link>
      </li>
      <li>
        <router-link :to="{... $route, params: {... $route.params, sort: 'recently-played' }}">
          Recently played
        </router-link>
      </li>
      <li>
        <router-link :to="{... $route, params: {... $route.params, sort: 'most-played' }}">
          Most played
        </router-link>
      </li>
      <li>
        <router-link :to="{... $route, params: {... $route.params, sort: 'a-z' }}">
          A-Z
        </router-link>
      </li>
      <li>
        <router-link :to="{... $route, params: {... $route.params, sort: 'random' }}">
          Random
        </router-link>
      </li>
    </ul>
    <AlbumList :items="albums" />
    <EmptyIndicator v-if="!loading && albums.length === 0" />
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import AlbumList from './AlbumList.vue'
  import { Album, AlbumSort } from '@/shared/api'
  import { useLoader } from '@/shared/loader'

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
      }
    },
    created() {
      const loader = useLoader()
      loader.showLoading()
      Promise.all([
        this.$api.getAlbums(this.sort as AlbumSort, 1000, 0).then(result => {
          this.albums = result
        }),
      ])
        .finally(() => {
          loader.hideLoading()
        })
    },
  })
</script>
