<template>
  <div class="main-content">
    <h1 class="display-5 fw-bold hero-title">
      {{ id }}
    </h1>
    <div class="text-nowrap mt-3">
      <b-button variant="transparent" class="me-2" title="Radio" @click="shuffleNow">
        <Icon icon="radio" />
      </b-button>
      <b-button variant="transparent" class="me-2" title="Playing" @click="$router.push({ name: 'queue' })">
        <Icon icon="soundwave" />
      </b-button>
    </div>
    <InfiniteList v-slot="{ items }" key="albums" :load="loadAlbums">
      <AlbumList :items="items" />
    </InfiniteList>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import InfiniteList from '@/shared/components/InfiniteList.vue'
  import { usePlayerStore } from '@/player/store'
  import { useLoader } from '@/shared/loader'
  import type { Album, Track } from '@/shared/api' // adjust path if necessary

  export default defineComponent({
    components: { AlbumList, InfiniteList },
    props: {
      id: { type: String, required: true },
      section: { type: String, default: 'albums' }
    },
    setup() {
      const playerStore = usePlayerStore()
      const loader = useLoader()
      return { playerStore, loader }
    },
    data() {
      return {
        currentSection: this.section,
        firstLoadDone: false
      }
    },
    watch: {
      '$route.params.section': {
        immediate: true,
        handler(newSection: string) {
          this.currentSection = newSection || 'albums'
        }
      }
    },
    methods: {
      async loadAlbums(offset: number): Promise<Album[]> {
        const loader = useLoader()
        if (!this.firstLoadDone) loader.showLoading()
        try {
          return await this.$api.getAlbumsByGenre(this.id, 30, offset)
        } finally {
          if (!this.firstLoadDone) {
            loader.hideLoading()
            this.firstLoadDone = true
          }
        }
      },

      async shuffleNow(): Promise<void> {
        this.loader.showLoading()
        await new Promise(resolve => setTimeout(resolve, 0)) // give loader a tick
        try {
          const albums: Album[] = await this.$api.getAlbumsByGenre(this.id, 50, 0)
          if (!albums.length) return

          const selectedAlbums: Album[] = []
          const copy: Album[] = [...albums]
          for (let i = 0; i < 5 && copy.length; i++) {
            const idx = Math.floor(Math.random() * copy.length)
            selectedAlbums.push(copy.splice(idx, 1)[0])
          }

          const albumDetails: Album[] = await Promise.all(
            selectedAlbums.map(album => this.$api.getAlbumDetails(album.id))
          )

          const tracks: Track[] = albumDetails.flatMap(album => album.tracks || [])
          if (!tracks.length) return

          this.playerStore.shuffleNow(tracks)
        } finally {
          this.loader.hideLoading()
        }
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
