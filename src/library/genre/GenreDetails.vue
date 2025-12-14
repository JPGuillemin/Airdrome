<template>
  <div class="main-content">
    <div class="d-flex align-items-center justify-content-between my-3">
      <div class="main-title">
        {{ id }}
      </div>
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
  import { defineComponent, ref, inject, watch } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import AlbumList from '@/library/album/AlbumList.vue'
  import InfiniteList from '@/shared/components/InfiniteList.vue'
  import { usePlayerStore } from '@/player/store'
  import { useLoader } from '@/shared/loader'
  import type { Album } from '@/shared/api'

  export default defineComponent({
    components: { AlbumList, InfiniteList },
    props: {
      id: { type: String, required: true },
      section: { type: String, default: 'albums' }
    },
    setup(props) {
      const playerStore = usePlayerStore()
      const api = inject('$api') as any
      const router = useRouter()
      const route = useRoute()
      const loader = useLoader()

      const currentSection = ref(props.section)
      const firstLoadDone = ref(false)

      watch(
        () => route.params.section,
        (newSection) => {
          // route.params.section can be string | string[] | undefined
          if (Array.isArray(newSection)) {
            currentSection.value = newSection[0] || 'albums'
          } else {
            currentSection.value = newSection || 'albums'
          }
        },
        { immediate: true }
      )

      const loadAlbums = async(offset: number): Promise<Album[]> => {
        return await api.getAlbumsByGenre(props.id, 30, offset)
      }

      const shuffleNow = async(): Promise<void> => {
        loader.showLoading()
        await new Promise(resolve => setTimeout(resolve, 0))
        let shouldRoute = false
        try {
          const tracks = await api.getRandomTracks({
            genre: props.id,
            size: 200
          })
          if (!tracks.length) return
          await playerStore.playNow(tracks)
          shouldRoute = true
        } finally {
          loader.hideLoading()
          if (shouldRoute) {
            router.push({ name: 'queue' })
          }
        }
      }

      return {
        playerStore,
        api,
        currentSection,
        firstLoadDone,
        loadAlbums,
        shuffleNow
      }
    }
  })
</script>
