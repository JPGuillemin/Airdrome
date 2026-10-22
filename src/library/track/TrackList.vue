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
        @click="onRowClick(index, item.id ?? index)"
        @mousedown="onMouseDown(item.id ?? index, $event)"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
        @touchstart="onTouchStart(item.id ?? index, $event)"
        @touchend="onTouchEnd"
        @touchmove="onTouchEnd"
      >
        <td v-if="selectable" class="col-select" @click.stop>
          <input
            type="checkbox"
            class="form-check-input"
            :checked="selected.includes(index)"
            :aria-label="`Select track ${index + 1 + indexOffset}`"
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
          :ref="(el) => setMenuRef(el, item.id ?? index)"
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

<script lang="ts">
  import { defineComponent, PropType } from 'vue'
  import { Track } from '@/shared/api'
  import { usePlayerStore } from '@/player/store'

  import BaseTable from '@/library/track/BaseTable.vue'
  import BaseTableHead from '@/library/track/BaseTableHead.vue'
  import CellDuration from '@/library/track/CellDuration.vue'
  import CellArtist from '@/library/track/CellArtist.vue'
  import CellAlbum from '@/library/track/CellAlbum.vue'
  import CellTrackNumber from '@/library/track/CellTrackNumber.vue'
  import CellCacheStatus from '@/library/track/CellCacheStatus.vue'
  import CellTitle from '@/library/track/CellTitle.vue'
  import RowActionsMenu from '@/library/track/RowActionsMenu.vue'

  const LONG_PRESS_MS = 500

  export default defineComponent({
    components: {
      BaseTable,
      BaseTableHead,
      CellTitle,
      CellTrackNumber,
      CellAlbum,
      CellArtist,
      CellDuration,
      CellCacheStatus,
      RowActionsMenu,
    },

    props: {
      tracks: { type: Array as PropType<Track[]>, required: true },
      isPlaylistView: { type: Boolean, default: false },

      selectable: { type: Boolean, default: false },
      selected: { type: Array as PropType<number[]>, default: () => [] },
      selectionTotal: { type: Number, default: null },
      noAlbum: Boolean,
      noArtist: Boolean,
      noDuration: Boolean,
      showImage: { type: Boolean, default: true },

      indexOffset: { type: Number, default: 0 },

      activeBy: {
        type: String as PropType<'id' | 'index'>,
        default: 'id',
      },

      playStrategy: {
        type: Function as PropType<(index: number) => void>,
        default: null,
      },
    },

    emits: ['remove-track', 'toggle-select', 'toggle-select-all'],

    setup(props, { emit }) {
      const playerStore = usePlayerStore()

      const isActive = (item: Track, index: number) => {
        return props.activeBy === 'index'
          ? index + props.indexOffset === playerStore.queueIndex
          : item.id === playerStore.trackId
      }

      const handlePlay = (index: number) => {
        playerStore.setShuffle(false)
        if (props.tracks[index].id === playerStore.trackId) {
          return playerStore.playPause()
        }
        if (props.playStrategy) {
          return props.playStrategy(index)
        }
        return playerStore.playTrackList(props.tracks, index)
      }

      const onRowClick = (index: number, key: string | number) => {
        if (isLongPressTriggered) {
          isLongPressTriggered = false
          return
        }
        if (props.selectable) return emit('toggle-select', index)
        return handlePlay(index)
      }

      const dragstart = (item: Track, event: DragEvent) => {
        if (!item.isStream) {
          event.dataTransfer?.setData('application/x-track-id', item.id)
        }
      }

      const menuRefs = new Map<string | number, any>()
      const setMenuRef = (el: any, key: string | number) => {
        if (el) menuRefs.set(key, el)
        else menuRefs.delete(key)
      }

      let pressTimer: ReturnType<typeof setTimeout> | null = null
      let isLongPressTriggered = false

      const triggerMenu = (key: string | number) => {
        isLongPressTriggered = true
        const menu = menuRefs.get(key)
        if (menu && typeof menu.open === 'function') {
          menu.open()
        }
      }

      const onMouseDown = (key: string | number, event: MouseEvent) => {
        // Only primary click
        if (event.button !== 0) return
        pressTimer = setTimeout(() => {
          pressTimer = null
          triggerMenu(key)
        }, LONG_PRESS_MS)
      }

      const onMouseUp = () => {
        if (pressTimer) {
          clearTimeout(pressTimer)
          pressTimer = null
        }
      }

      const onTouchStart = (key: string | number, event: TouchEvent) => {
        pressTimer = setTimeout(() => {
          pressTimer = null
          triggerMenu(key)
        }, LONG_PRESS_MS)
      }

      const onTouchEnd = () => {
        if (pressTimer) {
          clearTimeout(pressTimer)
          pressTimer = null
        }
      }

      return {
        playerStore,
        isActive,
        handlePlay,
        onRowClick,
        dragstart,
        setMenuRef,
        onMouseDown,
        onMouseUp,
        onTouchStart,
        onTouchEnd,
      }
    },

    computed: {
      allSelected(): boolean {
        const total = this.selectionTotal ?? this.tracks.length
        return total > 0 && this.selected.length >= total
      },
      someSelected(): boolean {
        return this.selected.length > 0
      },
      isPlaying(): boolean {
        return this.playerStore.isPlaying
      },
      playingTrackId() {
        return this.playerStore.trackId
      },
      queueIndex() {
        return this.playerStore.queueIndex
      },
    },
  })
</script>
