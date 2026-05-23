<template>
  <div class="main-content">
    <div class="d-flex align-items-center justify-content-between my-3">
      <div class="main-title">
        {{ id }}
      </div>
      <b-button
        v-longpress-tooltip
        variant="transparent"
        class="title-color me-2"
        title="Genre Radio"
        @click="shuffleNow"
      >
        <Icon icon="radio" />
      </b-button>
    </div>

    <InfiniteList v-slot="{ items }" key="artists" :load="loadArtists">
      <ArtistList :items="items" :allow-h-scroll="false" />
    </InfiniteList>
  </div>
</template>

<script lang="ts">
  import { defineComponent, inject } from 'vue'
  import InfiniteList from '@/shared/components/InfiniteList.vue'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import type { Artist } from '@/shared/api'
  import { useRadioStore } from '@/player/radio'
  import { longPressTooltip } from '@/shared/tooltips'

  export default defineComponent({
    components: {
      InfiniteList,
      ArtistList,
    },

    directives: {
      'longpress-tooltip': longPressTooltip,
    },

    props: {
      id: { type: String, required: true },
      section: { type: String, default: 'artists' },
    },

    setup(props) {
      const api = inject('$api') as any
      const radio = useRadioStore()

      const loadArtists = async (offset: number): Promise<Artist[]> => {
        return await api.getArtistsByGenre(props.id, 30, offset)
      }

      const shuffleNow = () => radio.shuffleGenre(props.id)

      return {
        loadArtists,
        shuffleNow,
      }
    },
  })
</script>
