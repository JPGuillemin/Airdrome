<template>
  <div class="main-content">
    <div v-if="result.albums.length > 0" class="pb-2 pt-3">
      <router-link v-if="!type" :to="{params: {type: 'album'}, query: $route.query}" class="text-muted">
        <div class="d-inline-flex align-items-center">
          <Icon icon="albums" class="title-color me-2" />
          <span class="section-title">
            Albums
          </span>
        </div>
      </router-link>
      <AlbumList :items="result.albums" />
    </div>

    <div v-if="result.artists.length > 0" class="pb-2 pt-3">
      <router-link v-if="!type" :to="{params: {type: 'artist'}, query: $route.query}" class="text-muted">
        <div class="d-inline-flex align-items-center">
          <Icon icon="artists" class="title-color me-2" />
          <span class="section-title">
            Artists
          </span>
        </div>
      </router-link>
      <ArtistList :items="result.artists" />
    </div>

    <div v-if="result.tracks.length > 0" class="pb-2 pt-3">
      <router-link :to="{params: {type: 'track'}, query: $route.query}" class="text-muted">
        <div class="d-inline-flex align-items-center">
          <Icon icon="tracks" class="title-color me-2" />
          <span class="section-title">
            Tracks
          </span>
        </div>
      </router-link>
      <TrackList :tracks="result.tracks" />
    </div>

    <EmptyIndicator v-if="!loading && !hasResult && !hasMore" label="No results" />

    <InfiniteLoader :loading="loading" :has-more="hasMore" @load-more="loadMore" />
  </div>
</template>
<script lang="ts">
  import { defineComponent, inject, ref, computed, watch } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import TrackList from '@/library/track/TrackList.vue'

  export default defineComponent({
    components: { AlbumList, ArtistList, TrackList },
    props: {
      query: { type: String, required: true },
      type: { type: String, default: null },
    },
    setup(props) {
      const api = inject('$api') as any
      const result = ref({
        albums: [] as any[],
        artists: [] as any[],
        tracks: [] as any[],
      })
      const loading = ref(false)
      const offset = ref(0)
      const hasMore = ref(true)

      const key = computed(() => '' + props.type + props.query)
      const hasResult = computed(() =>
        result.value.albums.length > 0 ||
        result.value.artists.length > 0 ||
        result.value.tracks.length > 0
      )

      watch(key, () => {
        result.value.albums = []
        result.value.artists = []
        result.value.tracks = []
        offset.value = 0
        hasMore.value = true
        loading.value = false
      }, { immediate: true })

      async function loadMore() {
        loading.value = true
        const res = await api.search(props.query, props.type, 20, offset.value)
        const size = res.albums.length + res.artists.length + res.tracks.length

        result.value.albums.push(...res.albums)
        result.value.artists.push(...res.artists)
        result.value.tracks.push(...res.tracks)

        offset.value += size
        hasMore.value = size >= 20
        loading.value = false
      }

      return { result, loading, offset, hasMore, key, hasResult, loadMore }
    },
  })
</script>
