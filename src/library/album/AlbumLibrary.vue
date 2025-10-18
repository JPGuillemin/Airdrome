<template>
  <div class="main-content">
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
      return { albums: [] as Album[], loading: true }
    },
    watch: {
      '$route.params.sort': {
        immediate: true,
        handler(newSort: string) {
          this.loadAlbums(newSort as AlbumSort)
        }
      }
    },
    methods: {
      async loadAlbums(sort: AlbumSort) {
        this.loading = true
        const loader = useLoader()
        loader.showLoading()
        try {
          this.albums = await this.$api.getAlbums(sort, 100000, 0)
        } finally {
          loader.hideLoading()
          this.loading = false
        }
      }
    }
  })
</script>
