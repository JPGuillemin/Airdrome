<template>
  <div class="main-content">
    <!-- Header -->
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h1 class="poster-title">
        Playing
      </h1>
      <div>
        <b-button variant="transparent" class="me-2" :disabled="!tracks?.length" @click="shuffle">
          <Icon icon="shuffle" /> Shuffle
        </b-button>
        <b-button variant="transparent" class="clear-btn" :disabled="!tracks?.length" @click="clear">
          <Icon icon="x" /> Clear

          <div v-if="tracks?.length === 1" class="tooltip bs-tooltip-bottom">
            <div class="tooltip-inner">
              Click again to clear current track
            </div>
          </div>
        </b-button>
        <OverflowMenu variant="transparent">
          <DropdownItem icon="plus" @click="savePlaylistModalVisible = true">
            Save as playlist
          </DropdownItem>
        </OverflowMenu>
      </div>
    </div>

    <TrackList
      v-if="tracks?.length"
      :tracks="tracks"
      active-by="index"
      :show-image="true"
      :play-strategy="play"
    >
      <template #actions="{ index }">
        <hr class="dropdown-divider">
        <DropdownItem
          icon="x"
          variant="danger"
          :disabled="index === queueIndex"
          @click="remove(index)"
        >
          Remove
        </DropdownItem>
      </template>
    </TrackList>

    <EmptyIndicator v-else />

    <CreatePlaylistModal v-model="savePlaylistModalVisible" :tracks="tracks" />
  </div>
</template>

<script lang='ts'>
  import { defineComponent, ref } from 'vue'
  import { usePlayerStore } from '@/player/store'
  import TrackList from '@/library/track/TrackList.vue'
  import CreatePlaylistModal from '@/library/playlist/CreatePlaylistModal.vue'
  import EmptyIndicator from '@/shared/components/EmptyIndicator.vue'

  export default defineComponent({
    components: {
      TrackList,
      CreatePlaylistModal,
      EmptyIndicator,
    },

    setup() {
      const playerStore = usePlayerStore()

      return {
        playerStore,
        savePlaylistModalVisible: ref(false),
      }
    },

    computed: {
      tracks() {
        return this.playerStore.queue
      },
      queueIndex() {
        return this.playerStore.queueIndex
      },
      isPlaying() {
        return this.playerStore.isPlaying
      },
    },

    methods: {
      play(index: number) {
        if (index === this.queueIndex) return this.playerStore.playPause()
        return this.playerStore.playTrackListIndex(index)
      },
      remove(idx: number) {
        return this.playerStore.removeFromQueue(idx)
      },
      clear() {
        return this.playerStore.clearQueue()
      },
      shuffle() {
        return this.playerStore.shuffleQueue()
      },
    },
  })
</script>

<style scoped>
  .clear-btn {
    position: relative;
  }
  .tooltip-inner {
    width: 300px;
  }
  .clear-btn:hover .tooltip {
    display: block;
    opacity: 1;
    right: 0;
  }
</style>
