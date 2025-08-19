<template>
  <div class="main-content">
    <h1>{{ id }}</h1>
    <ul class="nav-underlined mb-3">
      <li>
        <router-link :to="{... $route, params: { section: 'albums' }}">
          Albums
        </router-link>
      </li>
      <li>
        <router-link :to="{... $route, params: { section: 'tracks' }}">
          Tracks
        </router-link>
      </li>
      <li>
        <b-button variant="transparent" class="me-2" title="Shuffle" @click="shuffleNow">
          <Icon icon="shuffle" />
        </b-button>
      </li>
    </ul>
    <template v-if="section === 'tracks'">
      <InfiniteList v-slot="{ items }" key="tracks" :load="loadTracks">
        <TrackList :tracks="items" />
      </InfiniteList>
    </template>
    <template v-if="section === 'shuffle'">
      <InfiniteList v-slot="{ items }" key="tracks" :load="loadShuffle">
        <TrackList :tracks="items" />
      </InfiniteList>
    </template>
    <template v-if="section === 'albums'">
      <InfiniteList v-slot="{ items }" key="albums" :load="loadAlbums">
        <AlbumList :items="items" />
      </InfiniteList>
    </template>
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import { orderBy } from 'lodash-es'
  import AlbumList from '@/library/album/AlbumList.vue'
  import TrackList from '@/library/track/TrackList.vue'
  import InfiniteList from '@/shared/components/InfiniteList.vue'
  import { usePlayerStore } from '@/player/store'

  export default defineComponent({
    components: {
      AlbumList,
      TrackList,
      InfiniteList,
    },
    props: {
      id: { type: String, required: true },
      section: { type: String, default: 'albums' },
    },
    setup() {
      return {
        playerStore: usePlayerStore(),
      }
    },
    methods: {
      loadAlbums(offset: number) {
        return this.$api.getAlbumsByGenre(this.id, 100, offset)
      },
      async loadTracks(offset: number) {
        const tracks = await this.$api.getTracksByGenre(this.id, 200, offset)
        return orderBy(tracks, t => t.title?.toLowerCase(), 'asc')
      },
      async shuffleNow() {
        const tracks = await this.$api.getTracksByGenre(this.id, 10000, 0)
        return this.playerStore.shuffleNow(tracks)
      },
    }
  })
</script>
