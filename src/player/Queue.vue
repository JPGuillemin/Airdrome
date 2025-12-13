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

<script lang='ts'>
  import { defineComponent } from 'vue'
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
      return { playerStore }
    },
    data() {
      return {
        loading: false,
        visibleTracks: [] as any[],
        chunkSize: 20,
        nextIndex: 0,
        hasMore: true,
      }
    },
    computed: {
      allTracks() {
        return this.playerStore.queue
      },
      queueIndex() {
        return this.playerStore.queueIndex
      },
    },
    watch: {
      allTracks: {
        immediate: true,
        handler() {
          this.reset()
          this.appendNextChunk()
        },
      },
    },
    methods: {
      reset() {
        this.visibleTracks = []
        this.nextIndex = 0
        this.hasMore = true
      },

      loadMore() {
        this.appendNextChunk()
      },
      appendNextChunk() {
        const nextChunk = this.allTracks.slice(
          this.nextIndex,
          this.nextIndex + this.chunkSize
        )
        this.visibleTracks.push(...nextChunk)
        this.nextIndex += nextChunk.length
        this.hasMore = this.nextIndex < this.allTracks.length
      },
      play(index: number) {
        this.playerStore.setShuffle(false)
        if (index === this.queueIndex) {
          return this.playerStore.playPause()
        }
        return this.playerStore.playTrackListIndex(index)
      },
      remove(index: number) {
        this.playerStore.removeFromQueue(index)
      },
      clear(event: Event) {
        event.preventDefault()
        event.stopPropagation()
        const userConfirmed = window.confirm(
          'About to clear the play queue...\nContinue?'
        )
        if (!userConfirmed) return
        this.playerStore.clearQueue()
      },
      shuffle() {
        this.playerStore.shuffleQueue()
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
