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
        @mousedown="onMouseDown(rowKey(item, index), $event)"
        @mousemove="onMouseMove"
        @mouseup="cancelMousePress"
        @mouseleave="cancelMousePress"
        @click="onRowClick(index)"
        @contextmenu.prevent="openRowMenu(rowKey(item, index), $event)"
        @touchstart="onTouchStart(rowKey(item, index), $event)"
        @touchend="onTouchEnd"
        @touchmove="onTouchEnd"
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
          :ref="menuRefFor(item, index)"
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

  import BaseTable from '@/library/track/BaseTable.vue'
  import BaseTableHead from '@/library/track/BaseTableHead.vue'
  import CellDuration from '@/library/track/CellDuration.vue'
  import CellArtist from '@/library/track/CellArtist.vue'
  import CellAlbum from '@/library/track/CellAlbum.vue'
  import CellTrackNumber from '@/library/track/CellTrackNumber.vue'
  import CellCacheStatus from '@/library/track/CellCacheStatus.vue'
  import CellTitle from '@/library/track/CellTitle.vue'
  import RowActionsMenu from '@/library/track/RowActionsMenu.vue'

  var LONG_PRESS_MS = 500
  // Pixels the mouse may drift during a long press before it is cancelled
  var MOUSE_MOVE_TOLERANCE = 5

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
        // The click that ends a mouse long-press must not play / toggle the row
        if (suppressNextClick) {
          suppressNextClick = false
          return
        }

        if (props.selectable) {
          return emit('toggle-select', index)
        }

        return handlePlay(index)
      }

      function dragstart(item, event) {
        cancelMousePress()

        if (!item.isStream && event.dataTransfer) {
          event.dataTransfer.setData('application/x-track-id', item.id)
        }
      }

      // --- Row context menu (right click) / long-press (touch) ---
      // Keep a reference to each RowActionsMenu instance, keyed by the track
      // id (not its index, which changes when the list moves), so the right
      // menu can be opened at the click / touch point without a per-row
      // trigger button.
      var menuRefs = new Map()

      function setMenuRef(el, key) {
        if (el) {
          menuRefs.set(key, el)
        } else {
          menuRefs.delete(key)
        }
      }

      /** Build the ref callback that registers the menu of a given row. */
      function menuRefFor(item, index) {
        var key = rowKey(item, index)

        return function (el) {
          setMenuRef(el, key)
        }
      }

      function openRowMenu(key, event) {
        var menu = menuRefs.get(key)

        if (!menu) {
          return
        }

        var point = {
          top: event.clientY,
          bottom: event.clientY,
          left: event.clientX,
          right: event.clientX
        }

        menu.openAt(point)
      }

      var longPressTimer = null

      function onTouchStart(key, event) {
        var row = event.currentTarget

        longPressTimer = setTimeout(function () {
          longPressTimer = null

          var menu = menuRefs.get(key)

          if (!menu) {
            return
          }

          var rect = row.getBoundingClientRect()

          menu.openAt({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right })

          // Prevent the click that follows (and would start playback) from
          // propagating after the long-press opened the menu.
          row.addEventListener('click', function (e) {
            e.stopPropagation()
          }, { once: true, capture: true })
        }, LONG_PRESS_MS)
      }

      // --- Long-press with the mouse (desktop): same menu as right-click ---
      var mouseTimer = null
      var mouseStart = { x: 0, y: 0 }
      var suppressNextClick = false

      function cancelMousePress() {
        if (mouseTimer) {
          clearTimeout(mouseTimer)
          mouseTimer = null
        }
      }

      function onMouseDown(key, event) {
        suppressNextClick = false
        cancelMousePress()

        if (event.button !== 0) {
          return
        }

        // Checkboxes and other controls keep their normal behaviour
        var target = event.target

        if (target && target.closest && target.closest('input, button, a')) {
          return
        }

        mouseStart = { x: event.clientX, y: event.clientY }

        mouseTimer = setTimeout(function () {
          mouseTimer = null

          var menu = menuRefs.get(key)

          if (!menu) {
            return
          }

          suppressNextClick = true

          menu.openAt({
            top: mouseStart.y,
            bottom: mouseStart.y,
            left: mouseStart.x,
            right: mouseStart.x
          })
        }, LONG_PRESS_MS)
      }

      function onMouseMove(event) {
        if (!mouseTimer) {
          return
        }

        if (
          Math.abs(event.clientX - mouseStart.x) > MOUSE_MOVE_TOLERANCE ||
          Math.abs(event.clientY - mouseStart.y) > MOUSE_MOVE_TOLERANCE
        ) {
          cancelMousePress()
        }
      }

      function onTouchEnd() {
        if (longPressTimer) {
          clearTimeout(longPressTimer)
          longPressTimer = null
        }
      }

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
        rowKey: rowKey,
        isActive: isActive,
        handlePlay: handlePlay,
        onRowClick: onRowClick,
        dragstart: dragstart,
        setMenuRef: setMenuRef,
        menuRefFor: menuRefFor,
        openRowMenu: openRowMenu,
        onTouchStart: onTouchStart,
        onTouchEnd: onTouchEnd,
        onMouseDown: onMouseDown,
        onMouseMove: onMouseMove,
        cancelMousePress: cancelMousePress,
        allSelected: allSelected,
        someSelected: someSelected,
        isPlaying: isPlaying,
        playingTrackId: playingTrackId,
        queueIndex: queueIndex,
      }
    },
  })
</script>
