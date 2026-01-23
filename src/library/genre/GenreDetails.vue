<template>
  <div class="main-content">
    <div class="d-flex align-items-center justify-content-between my-3">
      <div class="main-title">
        {{ id }}
      </div>
      <b-button v-longpress-tooltip variant="transparent" class="title-color me-2" title="Genre Radio" @click="shuffleNow">
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
  import { useRoute } from 'vue-router'
  import AlbumList from '@/library/album/AlbumList.vue'
  import InfiniteList from '@/shared/components/InfiniteList.vue'
  import { usePlayerStore } from '@/player/store'
  import type { Album } from '@/shared/api'
  import { useRadioStore } from '@/player/radio'
  import { longPressTooltip } from '@/shared/tooltips'

  export default defineComponent({
    components: { AlbumList, InfiniteList },

    directives: {
      'longpress-tooltip': longPressTooltip
    },

    props: {
      id: { type: String, required: true },
      section: { type: String, default: 'albums' }
    },
    setup(props) {
      const playerStore = usePlayerStore()
      const api = inject('$api') as any
      const route = useRoute()
      const radio = useRadioStore()
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

      const shuffleNow = () => radio.shuffleGenre(props.id)

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
