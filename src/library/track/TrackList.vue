// TrackList.vue
<template>
  <BaseTable>
    <BaseTableHead>
      <th>#</th>

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
        @click="handlePlay(index)"
        @contextmenu.prevent="openRowMenu(index, $event)"
        @touchstart="onTouchStart(index, $event)"
        @touchend="onTouchEnd"
        @touchmove="onTouchEnd"
      >
        <CellTrackNumber
          :active="isActive(item, index) && isPlaying"
          :track-number="index + 1"
        />
        <CellTitle :track="item" :show-image="showImage" />
        <CellArtist v-if="!noArtist" :track="item" />
        <CellAlbum v-if="!noAlbum" :track="item" />
        <CellDuration v-if="!noDuration" :track="item" />
        <CellCacheStatus :track="item" />

        <RowActionsMenu
          :ref="(el) => setMenuRef(el, index)"
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
      noAlbum: Boolean,
      noArtist: Boolean,
      noDuration: Boolean,
      showImage: { type: Boolean, default: true },

      activeBy: {
        type: String as PropType<'id' | 'index'>,
        default: 'id',
      },

      playStrategy: {
        type: Function as PropType<(index: number) => void>,
        default: null,
      },
    },

    emits: ['remove-track'],

    setup(props) {
      const playerStore = usePlayerStore()

      const isActive = (item: Track, index: number) => {
        return props.activeBy === 'index'
          ? index === playerStore.queueIndex
          : item.id === playerStore.trackId
      }

      const handlePlay = (index: number) => {
        playerStore.setShuffle(false)
        if (props.tracks[index].id === playerStore.trackId) {
          return playerStore.playPause()
        }
        return playerStore.playTrackList(props.tracks, index)
      }

      const dragstart = (item: Track, event: DragEvent) => {
        if (!item.isStream) {
          event.dataTransfer?.setData('application/x-track-id', item.id)
        }
      }

      // --- Menu contextuel sur la ligne (clic droit) / long-press (tactile) ---
      // On garde une référence vers chaque instance RowActionsMenu pour
      // pouvoir ouvrir la bonne au point du clic/toucher, sans bouton
      // déclencheur par ligne.
      const menuRefs = new Map<number, any>()
      const setMenuRef = (el: any, index: number) => {
        if (el) menuRefs.set(index, el)
        else menuRefs.delete(index)
      }

      const openRowMenu = (index: number, event: MouseEvent) => {
        const menu = menuRefs.get(index)
        if (!menu) return
        const point = { top: event.clientY, bottom: event.clientY, left: event.clientX, right: event.clientX }
        menu.openAt(point)
      }

      let longPressTimer: ReturnType<typeof setTimeout> | null = null

      const onTouchStart = (index: number, event: TouchEvent) => {
        const row = event.currentTarget as HTMLElement
        longPressTimer = setTimeout(() => {
          longPressTimer = null
          const menu = menuRefs.get(index)
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
        dragstart,
        setMenuRef,
        openRowMenu,
        onTouchStart,
        onTouchEnd,
      }
    },

    computed: {
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
