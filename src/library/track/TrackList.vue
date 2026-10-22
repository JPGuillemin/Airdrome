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
        @click="onRowClick(index)"
        @contextmenu.prevent="openRowMenu(item.id ?? index, $event)"
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

      // Selection mode: shows a checkbox in place of the track number.
      // `selected` holds the indexes (within `tracks`) of the checked rows.
      selectable: { type: Boolean, default: false },
      selected: { type: Array as PropType<number[]>, default: () => [] },
      // Total selectable rows when `tracks` is only a loaded slice (lazy loading)
      selectionTotal: { type: Number, default: null },
      noAlbum: Boolean,
      noArtist: Boolean,
      noDuration: Boolean,
      showImage: { type: Boolean, default: true },

      // Position of tracks[0] within the real queue (when displaying a slice of it)
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

      // In selection mode a row click toggles the selection instead of playing
      const onRowClick = (index: number) => {
        if (props.selectable) return emit('toggle-select', index)
        return handlePlay(index)
      }

      const dragstart = (item: Track, event: DragEvent) => {
        if (!item.isStream) {
          event.dataTransfer?.setData('application/x-track-id', item.id)
        }
      }

      // --- Menu contextuel sur la ligne (clic droit) / long-press (tactile) ---
      // On garde une référence vers chaque instance RowActionsMenu, keyed par
      // l'id du morceau (et non son index, qui change quand la liste bouge),
      // pour pouvoir ouvrir la bonne au point du clic/toucher, sans bouton
      // déclencheur par ligne.
      const menuRefs = new Map<string | number, any>()
      const setMenuRef = (el: any, key: string | number) => {
        if (el) menuRefs.set(key, el)
        else menuRefs.delete(key)
      }

      const openRowMenu = (key: string | number, event: MouseEvent) => {
        const menu = menuRefs.get(key)
        if (!menu) return
        const point = { top: event.clientY, bottom: event.clientY, left: event.clientX, right: event.clientX }
        menu.openAt(point)
      }

      let longPressTimer: ReturnType<typeof setTimeout> | null = null

      const onTouchStart = (key: string | number, event: TouchEvent) => {
        const row = event.currentTarget as HTMLElement
        longPressTimer = setTimeout(() => {
          longPressTimer = null
          const menu = menuRefs.get(key)
          if (!menu) return
          const rect = row.getBoundingClientRect()
          menu.openAt({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right })
          // Empêche le click qui suit (déclenchant la lecture) de se
          // propager après l'ouverture du menu par long-press.
          row.addEventListener('click', (e) => e.stopPropagation(), { once: true, capture: true })
        }, LONG_PRESS_MS)
      }

      const onTouchEnd = () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer)
          longPressTimer = null
        }
      }

      return {
        playerStore,
        isActive,
        handlePlay,
        onRowClick,
        dragstart,
        setMenuRef,
        openRowMenu,
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
