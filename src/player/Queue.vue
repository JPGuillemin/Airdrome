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
        <!-- With a selection, the trash button removes the selected tracks instead of clearing the queue -->
        <b-button
          v-if="selectedIndexes.length"
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          :title="'Remove ' + selectedIndexes.length + ' selected'"
          @click="removeSelected"
        >
          <Icon icon="trash" />
        </b-button>
        <b-button v-else v-longpress-tooltip variant="transparent" class="me-2" :disabled="!allTracks.length" title="Delete" @click="clear">
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
      :selectable="selectedIndexes.length > 0"
      :selected="selectedIndexes"
      :selection-total="Math.max(0, allTracks.length - startIndex)"
      @toggle-select="toggleSelect"
      @toggle-select-all="toggleSelectAll"
    >
      <template #actions="slotProps">
        <TrackMenuItem
          icon="check"
          @click="toggleSelect(slotProps.index)"
        >
          <template v-if="selectedIndexes.indexOf(slotProps.index) !== -1">
            Deselect
          </template>
          <template v-else>
            Select
          </template>
        </TrackMenuItem>
        <hr class="dropdown-divider">
        <TrackMenuItem
          icon="x"
          variant="danger"
          @click="remove(slotProps.index)"
        >
          Remove
        </TrackMenuItem>
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

<script>
  import { defineComponent, ref, computed, watch, onActivated } from 'vue'
  import { usePlayerStore } from '@/player/store'
  import TrackList from '@/library/track/TrackList.vue'
  import TrackMenuItem from '@/shared/components/TrackMenuItem.vue'
  import EmptyIndicator from '@/shared/components/EmptyIndicator.vue'
  import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
  import { longPressTooltip } from '@/shared/tooltips'

  // Number of already-played tracks kept visible above the current one.
  var HISTORY_SIZE = 2

  export default defineComponent({
    components: {
      TrackList: TrackList,
      TrackMenuItem: TrackMenuItem,
      EmptyIndicator: EmptyIndicator,
      ConfirmDialog: ConfirmDialog,
    },

    directives: {
      'longpress-tooltip': longPressTooltip,
    },

    setup: function () {
      var playerStore = usePlayerStore()

      var loading = ref(false)
      var visibleTracks = ref([])
      var chunkSize = ref(20)
      var nextIndex = ref(0)
      var hasMore = ref(true)
      var confirmDialog = ref(null)
      var selectedIndexes = ref([])

      var allTracks = computed(function () {
        return playerStore.queue
      })

      var queueIndex = computed(function () {
        return playerStore.queueIndex
      })

      // First queue index displayed: at most HISTORY_SIZE tracks before the
      // current one. Kept fixed so clicking a track never shifts the rows.
      function computeStartIndex() {
        return Math.max(0, queueIndex.value - HISTORY_SIZE)
      }

      var startIndex = ref(computeStartIndex())

      onActivated(function () {
        startIndex.value = computeStartIndex()
      })

      watch(queueIndex, function (index) {
        if (index < startIndex.value) {
          startIndex.value = computeStartIndex()
        }
      })

      function reset() {
        visibleTracks.value = []
        nextIndex.value = 0
        hasMore.value = true
      }

      function appendNextChunk() {
        var from = startIndex.value + nextIndex.value
        var nextChunk = allTracks.value.slice(from, from + chunkSize.value)

        for (var i = 0; i < nextChunk.length; i++) {
          visibleTracks.value.push(nextChunk[i])
        }

        nextIndex.value += nextChunk.length
        hasMore.value = startIndex.value + nextIndex.value < allTracks.value.length
      }

      function loadMore() {
        appendNextChunk()
      }

      function play(index) {
        playerStore.setShuffle(false)

        if (index === queueIndex.value) {
          return playerStore.play()
        }

        return playerStore.playTrackListIndex(index)
      }

      function playFromList(index) {
        return playerStore.playTrackListIndex(startIndex.value + index)
      }

      function toggleSelect(index) {
        var position = selectedIndexes.value.indexOf(index)

        if (position !== -1) {
          selectedIndexes.value = selectedIndexes.value.filter(function (item) {
            return item !== index
          })
        } else {
          selectedIndexes.value = selectedIndexes.value.concat([index])
        }
      }

      function toggleSelectAll() {
        var total = Math.max(0, allTracks.value.length - startIndex.value)

        if (selectedIndexes.value.length >= total) {
          selectedIndexes.value = []
          return
        }

        var selection = []

        for (var i = 0; i < total; i++) {
          selection.push(i)
        }

        selectedIndexes.value = selection
      }

      function remove(index) {
        selectedIndexes.value = selectedIndexes.value
          .filter(function (item) {
            return item !== index
          })
          .map(function (item) {
            if (item > index) {
              return item - 1
            }

            return item
          })

        playerStore.removeFromQueue(startIndex.value + index)
      }

      async function removeSelected() {
        if (!confirmDialog.value || !selectedIndexes.value.length) {
          return
        }

        var count = selectedIndexes.value.length
        var plural = ''

        if (count > 1) {
          plural = 's'
        }

        var message = 'About to remove ' + count + ' track' + plural +
          ' from the play queue : continue?'

        var userConfirmed = await confirmDialog.value.open('Remove', message)

        if (!userConfirmed) {
          return
        }

        var queueIndexes = selectedIndexes.value.map(function (item) {
          return startIndex.value + item
        }).sort(function (a, b) {
          return b - a
        })

        selectedIndexes.value = []

        for (var i = 0; i < queueIndexes.length; i++) {
          await playerStore.removeFromQueue(queueIndexes[i])
        }
      }

      watch(startIndex, function () {
        selectedIndexes.value = []
      })

      watch(function () {
        return allTracks.value.length
      }, function (length, previous) {
        if (length > previous) {
          selectedIndexes.value = []
        }
      })

      async function clear() {
        if (!confirmDialog.value) {
          return
        }

        var userConfirmed = await confirmDialog.value.open(
          'Clear the play queue',
          'About to clear the play queue : continue?'
        )

        if (userConfirmed) {
          playerStore.clearQueue()
        }
      }

      function shuffleQueue() {
        playerStore.shuffleQueue()
      }

      watch(
        function () {
          return [allTracks.value, allTracks.value.length, startIndex.value]
        },
        function () {
          reset()
          appendNextChunk()
        },
        { immediate: true }
      )

      return {
        playerStore: playerStore,
        loading: loading,
        visibleTracks: visibleTracks,
        chunkSize: chunkSize,
        nextIndex: nextIndex,
        hasMore: hasMore,
        allTracks: allTracks,
        queueIndex: queueIndex,
        startIndex: startIndex,
        confirmDialog: confirmDialog,
        selectedIndexes: selectedIndexes,
        reset: reset,
        loadMore: loadMore,
        appendNextChunk: appendNextChunk,
        play: play,
        playFromList: playFromList,
        toggleSelect: toggleSelect,
        toggleSelectAll: toggleSelectAll,
        remove: remove,
        removeSelected: removeSelected,
        clear: clear,
        shuffle: shuffleQueue,
      }
    },
  })
</script>
