<template>
  <div class="main-content">
    <h1 class="display-5 fw-bold hero-title">
      Artists
    </h1>
    <ul class="nav-underlined mb-3">
      <li>
        <router-link :to="{... $route, params: {... $route.params, sort: null }}">
          Most albums
        </router-link>
      </li>
      <li>
        <router-link :to="{... $route, params: {... $route.params, sort: 'a-z' }}">
          A-Z
        </router-link>
      </li>
    </ul>
    <ArtistList :items="sortedItems" />
    <EmptyIndicator v-if="items.length === 0" />
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import ArtistList from './ArtistList.vue'
  import { Artist } from '@/shared/api'
  import { orderBy } from 'lodash-es'
  import { useLoader } from '@/shared/loader'

  export default defineComponent({
    components: {
      ArtistList,
    },
    props: {
      sort: { type: String, default: null },
    },
    data() {
      return {
        loading: true,
        items: [] as readonly Artist[]
      }
    },
    computed: {
      sortedItems(): Artist[] {
        return this.sort === 'a-z'
          ? orderBy(this.items, 'name')
          : orderBy(this.items, 'albumCount', 'desc')
      },
    },
    created() {
      this.loading = true
      const loader = useLoader()
      loader.showLoading()
      Promise.all([
        this.$api.getArtists().then(result => {
          this.items = result
        }),
      ])
        .finally(() => {
          this.loading = false
          loader.hideLoading()
        })
    },
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
