// Queue.vue
<template>
  <div class="main-content">
    <ConfirmDialog ref="confirmDialog" />
    <!-- Header -->
    <div class="d-flex justify-content-between align-items-center my-3">
      <div class="d-inline-flex align-items-center">
        <Icon icon="soundwave" class="title-color me-2" />
        <span class="main-title">
          Playing
        </span>
      </div>
      <div>
        <b-button v-longpress-tooltip variant="transparent" class="me-2" :disabled="!allTracks.length" title="Recycle" @click="play(0)">
          <Icon icon="recycle" />
        </b-button>
        <b-button v-longpress-tooltip variant="transparent" class="me-2" :disabled="!allTracks.length" title="Shuffle" @click="shuffle">
          <Icon icon="random" />
        </b-button>
        <b-button v-longpress-tooltip variant="transparent" class="me-2" :disabled="!allTracks.length" title="Delete" @click="clear">
          <Icon icon="trash" />
        </b-button>
      </div>
    </div>

    <TrackList
      v-if="visibleTracks.length"
      :tracks="visibleTracks"
      active-by="index"
      :show-image="true"
      :index-offset="startIndex"
      :play-strategy="playFromList"
    >
      <template #actions="{ index }">
        <hr class="dropdown-divider">
        <DropdownItem
          icon="x"
          variant="danger"
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
  import { defineComponent, ref, computed, watch, onActivated } from 'vue'
  import { usePlayerStore } from '@/player/store'
  import TrackList from '@/library/track/TrackList.vue'
  import EmptyIndicator from '@/shared/components/EmptyIndicator.vue'
  import ConfirmDialog, { ConfirmDialogExpose } from '@/shared/components/ConfirmDialog.vue'
  import { longPressTooltip } from '@/shared/tooltips'

  // Number of already-played tracks kept visible above the current one
  const HISTORY_SIZE = 5

  export default defineComponent({
    components: {
      TrackList,
      EmptyIndicator,
      ConfirmDialog,
    },

    directives: {
      'longpress-tooltip': longPressTooltip
    },

    setup() {
      const playerStore = usePlayerStore()

      const loading = ref(false)
      const visibleTracks = ref<any[]>([])
      const chunkSize = ref(20)
      const nextIndex = ref(0)
      const hasMore = ref(true)
      const confirmDialog = ref<ConfirmDialogExpose | null>(null)
      const allTracks = computed(() => playerStore.queue)
      const queueIndex = computed(() => playerStore.queueIndex)

      // First queue index displayed: at most HISTORY_SIZE tracks before the current one.
      // Computed once when the page is rendered and then kept fixed, so clicking a
      // track (or auto-advancing) never hides or shifts the rows.
      const computeStartIndex = () => Math.max(0, queueIndex.value - HISTORY_SIZE)
      const startIndex = ref(computeStartIndex())

      // Re-anchor every time the page is displayed (also when it comes back from
      // the <KeepAlive> cache after navigating elsewhere).
      onActivated(() => {
        startIndex.value = computeStartIndex()
      })

      // Only re-anchor if the current track ends up above the window
      // (queue cleared, shuffled or replaced).
      watch(queueIndex, (index) => {
        if (index < startIndex.value) startIndex.value = computeStartIndex()
      })

      const reset = () => {
        visibleTracks.value = []
        nextIndex.value = 0
        hasMore.value = true
      }

      const appendNextChunk = () => {
        const from = startIndex.value + nextIndex.value
        const nextChunk = allTracks.value.slice(from, from + chunkSize.value)
        visibleTracks.value.push(...nextChunk)
        nextIndex.value += nextChunk.length
        hasMore.value = startIndex.value + nextIndex.value < allTracks.value.length
      }

      const loadMore = () => {
        appendNextChunk()
      }

      const play = (index: number) => {
        playerStore.setShuffle(false)
        if (index === queueIndex.value) {
          return playerStore.play()
        }
        return playerStore.playTrackListIndex(index)
      }

      // Play a row of the displayed (sliced) list: convert to the real queue index
      const playFromList = (index: number) => {
        return playerStore.playTrackListIndex(startIndex.value + index)
      }

      const remove = (index: number) => {
        playerStore.removeFromQueue(startIndex.value + index)
      }

      const clear = async() => {
        if (!confirmDialog.value) return

        const userConfirmed = await confirmDialog.value.open(
          'Clear the play queue',
          'About to clear the play queue : continue?'
        )
        if (!userConfirmed) return
        playerStore.clearQueue()
      }

      const shuffle = () => {
        playerStore.shuffleQueue()
      }

      watch(
        () => [allTracks.value, allTracks.value.length, startIndex.value] as const,
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
        startIndex,
        confirmDialog,
        reset,
        loadMore,
        appendNextChunk,
        play,
        playFromList,
        remove,
        clear,
        shuffle,
      }
    },
  })
</script>
