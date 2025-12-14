<template>
  <div class="main-content">
    <!-- Header -->
    <div class="d-flex justify-content-between align-items-center my-3">
      <div class="d-inline-flex align-items-center">
        <Icon icon="soundwave" class="title-color me-2" />
        <span class="main-title">
          Playing
        </span>
      </div>
      <div>
        <b-button variant="transparent" class="me-2" :disabled="!allTracks.length" @click="play">
          <Icon icon="play" />
        </b-button>
        <b-button variant="transparent" class="me-2" :disabled="!allTracks.length" @click="shuffle">
          <Icon icon="random" />
        </b-button>
        <b-button variant="transparent" class="me-2" :disabled="!allTracks.length" @click="clear">
          <Icon icon="trash" />
        </b-button>
      </div>
    </div>

    <TrackList
      v-if="visibleTracks.length"
      :tracks="visibleTracks"
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
    <InfiniteLoader
      :loading="loading"
      :has-more="hasMore"
      @load-more="loadMore"
    />
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref, computed, watch } from 'vue'
  import { usePlayerStore } from '@/player/store'
  import TrackList from '@/library/track/TrackList.vue'
  import EmptyIndicator from '@/shared/components/EmptyIndicator.vue'

  export default defineComponent({
    components: {
      TrackList,
      EmptyIndicator,
    },
    setup() {
      const playerStore = usePlayerStore()

      const loading = ref(false)
      const visibleTracks = ref<any[]>([])
      const chunkSize = ref(20)
      const nextIndex = ref(0)
      const hasMore = ref(true)

      const allTracks = computed(() => playerStore.queue)
      const queueIndex = computed(() => playerStore.queueIndex)

      function reset() {
        visibleTracks.value = []
        nextIndex.value = 0
        hasMore.value = true
      }

      function appendNextChunk() {
        const nextChunk = allTracks.value.slice(
          nextIndex.value,
          nextIndex.value + chunkSize.value
        )
        visibleTracks.value.push(...nextChunk)
        nextIndex.value += nextChunk.length
        hasMore.value = nextIndex.value < allTracks.value.length
      }

      function loadMore() {
        appendNextChunk()
      }

      function play(index: number) {
        playerStore.setShuffle(false)
        if (index === queueIndex.value) {
          return playerStore.playPause()
        }
        return playerStore.playTrackListIndex(index)
      }

      function remove(index: number) {
        playerStore.removeFromQueue(index)
      }

      function clear(event: Event) {
        event.preventDefault()
        event.stopPropagation()
        const userConfirmed = window.confirm(
          'About to clear the play queue...\nContinue?'
        )
        if (!userConfirmed) return
        playerStore.clearQueue()
      }

      function shuffle() {
        playerStore.shuffleQueue()
      }

      watch(
        allTracks,
        () => {
          reset()
          appendNextChunk()
        },
        { immediate: true }
      )

      return {
        playerStore,

        loading,
        visibleTracks,
        chunkSize,
        nextIndex,
        hasMore,

        allTracks,
        queueIndex,

        reset,
        loadMore,
        appendNextChunk,
        play,
        remove,
        clear,
        shuffle,
      }
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
