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

<script>
  import { defineComponent, inject } from 'vue'
  import InfiniteList from '@/shared/components/InfiniteList.vue'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import { useRadioStore } from '@/player/radio'
  import { longPressTooltip } from '@/shared/tooltips'

  export default defineComponent({
    components: {
      InfiniteList: InfiniteList,
      ArtistList: ArtistList,
    },

    directives: {
      'longpress-tooltip': longPressTooltip,
    },

    props: {
      /** Genre identifier from the route. */
      id: { type: String, required: true },
      /** Section displayed for this genre. */
      section: { type: String, default: 'artists' },
    },

    setup: function (props) {
      var api = inject('$api')
      var radio = useRadioStore()

      /**
       * Load a page of artists belonging to the genre.
       *
       * @param {number} offset
       * @returns {Promise<Array>}
       */
      async function loadArtists(offset) {
        return await api.getArtistsByGenre(props.id, 30, offset)
      }

      async function shuffleNow() {
        return await radio.shuffleGenre(props.id)
      }

      return {
        loadArtists: loadArtists,
        shuffleNow: shuffleNow,
      }
    },
  })
</script>
