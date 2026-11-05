// TrackList.vue
<template>
  <BaseTable>
    <BaseTableHead>
      <th v-if="selectable" class="col-select">
        <input
          type="checkbox"
          class="form-check-input"
          aria-label="Select all tracks"
          :checked="allSelected"
          :indeterminate="someSelected && !allSelected"
          @change="$emit('toggle-select-all')"
        >
      </th>
      <th v-else>
        #
      </th>

      <th class="text-start">
        Title
      </th>

      <th v-if="!noArtist" class="text-start d-none d-lg-table-cell">
        Artist
      </th>

      <th v-if="!noAlbum" class="text-start d-none d-md-table-cell">
        Album
      </th>

      <th v-if="!noDuration" class="text-start">
        Time
      </th>

      <th class="col-cachestatus" />
    </BaseTableHead>

    <tbody>
      <tr
        v-for="(item, index) in tracks"
        :key="item.id || index"
        :class="{ active: isActive(item, index) }"
        draggable="true"
        @dragstart="dragstart(item, $event)"
        @mousedown="rowMenu.onMouseDown(rowKey(item, index), $event)"
        @mousemove="rowMenu.onMouseMove"
        @mouseup="rowMenu.onMouseUp"
        @mouseleave="rowMenu.onMouseUp"
        @click="onRowClick(index)"
        @contextmenu.prevent="rowMenu.onContextMenu(rowKey(item, index), $event)"
        @touchstart="rowMenu.onTouchStart(rowKey(item, index), $event)"
        @touchend="rowMenu.onTouchEnd"
        @touchmove="rowMenu.onTouchMove"
      >
        <td v-if="selectable" class="col-select" @click.stop>
          <input
            type="checkbox"
            class="form-check-input"
            :checked="selected.indexOf(index) !== -1"
            :aria-label="'Select track ' + (index + 1 + indexOffset)"
            @change="$emit('toggle-select', index)"
          >
        </td>
        <CellTrackNumber
          v-else
          :active="isActive(item, index) && isPlaying"
          :track-number="index + 1 + indexOffset"
        />
        <CellTitle :track="item" :show-image="showImage" />
        <CellArtist v-if="!noArtist" :track="item" />
        <CellAlbum v-if="!noAlbum" :track="item" />
        <CellDuration v-if="!noDuration" :track="item" />
        <CellCacheStatus :track="item" />

        <RowActionsMenu
          :ref="rowMenu.menuRefFor(rowKey(item, index))"
          :track="item"
          :is-playlist-view="isPlaylistView"
          @remove="$emit('remove-track', index)"
        >
          <slot name="actions" :index="index" :item="item" />
        </RowActionsMenu>
      </tr>
    </tbody>
  </BaseTable>
</template>

<script>
  import { defineComponent, watch, computed } from 'vue'
  import { usePlayerStore } from '@/player/store'
  import { useCacheStore } from '@/shared/cache'
  import { useRowMenu } from '@/shared/useRowMenu'

  import BaseTable from '@/library/track/BaseTable.vue'
  import BaseTableHead from '@/library/track/BaseTableHead.vue'
  import CellDuration from '@/library/track/CellDuration.vue'
  import CellArtist from '@/library/track/CellArtist.vue'
  import CellAlbum from '@/library/track/CellAlbum.vue'
  import CellTrackNumber from '@/library/track/CellTrackNumber.vue'
  import CellCacheStatus from '@/library/track/CellCacheStatus.vue'
  import CellTitle from '@/library/track/CellTitle.vue'
  import RowActionsMenu from '@/library/track/RowActionsMenu.vue'

  export default defineComponent({
    components: {
      BaseTable: BaseTable,
      BaseTableHead: BaseTableHead,
      CellTitle: CellTitle,
      CellTrackNumber: CellTrackNumber,
      CellAlbum: CellAlbum,
      CellArtist: CellArtist,
      CellDuration: CellDuration,
      CellCacheStatus: CellCacheStatus,
      RowActionsMenu: RowActionsMenu,
    },

    props: {
      /** Tracks displayed by the list. */
      tracks: { type: Array, required: true },
      isPlaylistView: { type: Boolean, default: false },

      // Selection mode: shows a checkbox in place of the track number.
      // `selected` holds the indexes (within `tracks`) of the checked rows.
      selectable: { type: Boolean, default: false },
      selected: { type: Array, default: function () { return [] } },
      // Total selectable rows when `tracks` is only a loaded slice (lazy loading)
      selectionTotal: { type: Number, default: null },
      noAlbum: Boolean,
      noArtist: Boolean,
      noDuration: Boolean,
      showImage: { type: Boolean, default: true },

      // Position of tracks[0] within the real queue (when displaying a slice of it)
      indexOffset: { type: Number, default: 0 },

      /** Whether the active row is matched by track id or by list index. */
      activeBy: {
        type: String,
        default: 'id',
      },

      /** Optional function used instead of the player store to start playback. */
      playStrategy: {
        type: Function,
        default: null,
      },
    },

    emits: ['remove-track', 'toggle-select', 'toggle-select-all'],

    setup: function (props, context) {
      var emit = context.emit
      var playerStore = usePlayerStore()
      var cacheStore = useCacheStore()
      var rowMenu = useRowMenu()

      // Resolve cache status for the whole list in one pass instead of two
      // async lookups per row.
      watch(
        function () {
          return props.tracks.map(function (track) {
            return track.url
          })
        },
        function (urls) {
          cacheStore.primeStatus(urls)
        },
        { immediate: true }
      )

      /** Row key: the track id, falling back to the list index. */
      function rowKey(item, index) {
        if (item.id === null || item.id === undefined) {
          return index
        }

        return item.id
      }

      function isActive(item, index) {
        if (props.activeBy === 'index') {
          return index + props.indexOffset === playerStore.queueIndex
        }

        return item.id === playerStore.trackId
      }

      function handlePlay(index) {
        playerStore.setShuffle(false)

        if (props.tracks[index].id === playerStore.trackId) {
          return playerStore.playPause()
        }

        if (props.playStrategy) {
          return props.playStrategy(index)
        }

        return playerStore.playTrackList(props.tracks, index)
      }

      // In selection mode a row click toggles the selection instead of playing
      function onRowClick(index) {
        // The click that ends a long-press must not play / toggle the row
        if (rowMenu.consumeSuppressedClick()) {
          return
        }

        if (props.selectable) {
          return emit('toggle-select', index)
        }

        return handlePlay(index)
      }

      function dragstart(item, event) {
        rowMenu.onMouseUp()

        if (!item.isStream && event.dataTransfer) {
          event.dataTransfer.setData('application/x-track-id', item.id)
        }
      }

      // --- Row context menu (right click) / long press are handled by
      // useRowMenu, keyed by the track id (not its index, which changes when
      // the list moves).
      var allSelected = computed(function () {
        var total = props.tracks.length

        if (props.selectionTotal !== null && props.selectionTotal !== undefined) {
          total = props.selectionTotal
        }

        return total > 0 && props.selected.length >= total
      })

      var someSelected = computed(function () {
        return props.selected.length > 0
      })

      var isPlaying = computed(function () {
        return playerStore.isPlaying
      })

      var playingTrackId = computed(function () {
        return playerStore.trackId
      })

      var queueIndex = computed(function () {
        return playerStore.queueIndex
      })

      return {
        playerStore: playerStore,
        rowMenu: rowMenu,
        rowKey: rowKey,
        isActive: isActive,
        handlePlay: handlePlay,
        onRowClick: onRowClick,
        dragstart: dragstart,
        allSelected: allSelected,
        someSelected: someSelected,
        isPlaying: isPlaying,
        playingTrackId: playingTrackId,
        queueIndex: queueIndex,
      }
    },
  })
</script>
