<template>
  <div class="main-content">
    <h1>{{ id }}</h1>
    <ul class="nav-underlined mb-3">
      <li>
        <router-link :to="{... $route, params: { }}">
          Albums
        </router-link>
      </li>
      <li>
        <router-link :to="{... $route, params: { section: 'tracks' }}">
          Tracks
        </router-link>
      </li>
    </ul>
    <template v-if="section === 'tracks'">
      <InfiniteList v-slot="{ items }" key="tracks" :load="loadTracks">
        <TrackList :tracks="items" />
      </InfiniteList>
    </template>
    <template v-else>
      <InfiniteList v-slot="{ items }" key="albums" :load="loadAlbums">
        <AlbumList :items="items" />
      </InfiniteList>
    </template>
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import TrackList from '@/library/track/TrackList.vue'
  import InfiniteList from '@/shared/components/InfiniteList.vue'

  export default defineComponent({
    components: {
      AlbumList,
      TrackList,
      InfiniteList,
    },
    props: {
      id: { type: String, required: true },
      section: { type: String, default: '' },
    },
    methods: {
      loadAlbums(offset: number) {
        return this.$api.getAlbumsByGenre(this.id, 50, offset)
      },
      loadTracks(offset: number) {
        return this.$api.getTracksByGenre(this.id, 50, offset)
      },
    }
  })
</script>
