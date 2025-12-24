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
  import { defineComponent, ref, watch, inject } from 'vue'
  import AlbumList from './AlbumList.vue'
  import { Album, AlbumSort } from '@/shared/api'

  export default defineComponent({
    components: { AlbumList },
    props: { sort: { type: String, default: 'recently-added' } },
    setup(props) {
      const albums = ref<Album[]>([])
      const loading = ref(true)
      const offset = ref(0)
      const hasMore = ref(true)
      const api = inject('$api') as any

      watch(
        () => props.sort,
        () => {
          albums.value = []
          offset.value = 0
          hasMore.value = true
        }
      )

      const loadMore = async() => {
        loading.value = true
        const newAlbums = await api.getAlbums(props.sort as AlbumSort, 30, offset.value)
        albums.value.push(...newAlbums)
        offset.value += newAlbums.length
        hasMore.value = newAlbums.length >= 30
        loading.value = false
      }

      return {
        albums,
        loading,
        offset,
        hasMore,
        loadMore,
      }
    },
  })
</script>
