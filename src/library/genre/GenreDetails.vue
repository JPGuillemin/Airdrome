<template>
  <div class="main-content">
    <h1 class="display-5  hero-title">
      {{ id }}
    </h1>
    <div class="text-nowrap mt-3">
      <b-button variant="transparent" class="me-2" title="Radio" @click="shuffleNow">
        <Icon icon="radio" />
      </b-button>
      <b-button variant="transparent" class="me-2 d-md-none" title="Playing" @click="$router.push({ name: 'queue' })">
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
      return { playerStore }
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
        return await this.$api.getAlbumsByGenre(this.id, 30, offset)
      },
      async shuffleNow(): Promise<void> {
        const loader = useLoader()
        loader.showLoading()
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
          loader.hideLoading()
        }
      }
    }
  })
</script>
