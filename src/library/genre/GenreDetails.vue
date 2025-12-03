<template>
  <div class="main-content">
    <h1 class="custom-title  mt-3">
      {{ id }}
    </h1>
    <div class="text-nowrap my-2">
      <b-button variant="transparent" class="me-2" title="Radio" @click="shuffleNow">
        <Icon icon="radio" />
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
  import type { Album } from '@/shared/api' // adjust path if necessary

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
        await new Promise(resolve => setTimeout(resolve, 0)) // let loader render
        try {
          const tracks = await this.$api.getRandomSongs({
            genre: this.id,
            size: 200, // or 50 if you prefer smaller
          })
          if (!tracks.length) return
          this.playerStore.playNow(tracks)
        } finally {
          loader.hideLoading()
        }
      }
    }
  })
</script>
