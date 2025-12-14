<template>
  <BaseTable>
    <BaseTableHead>
      <th v-if="!noArtist" class="text-start d-none d-lg-table-cell">
        Artist
      </th>
      <th v-if="!noAlbum" class="text-start d-none d-md-table-cell">
        Album
      </th>
      <th v-if="!noDuration" class="text-start d-md-table-cell">
        Time
      </th>
    </BaseTableHead>

    <tbody>
      <tr
        v-for="(item, index) in tracks"
        :key="item.id || index"
        :class="{ active: isActive(item, index) }"
        draggable="true"
        @dragstart="dragstart(item, $event)"
        @click="handlePlay(index)"
      >
        <CellTrackNumber
          :active="isActive(item, index) && isPlaying"
          :track-number="index + 1"
        />
        <CellTitle :track="item" :show-image="showImage" />
        <CellArtist v-if="!noArtist" :track="item" />
        <CellAlbum v-if="!noAlbum" :track="item" />
        <CellDuration v-if="!noDuration" :track="item" />

        <CellActions
          :track="item"
          :is-playlist-view="isPlaylistView"
          @remove="$emit('remove-track', index)"
        >
          <slot name="actions" :index="index" :item="item" />
        </CellActions>
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
  import CellActions from '@/library/track/CellActions.vue'
  import CellTitle from '@/library/track/CellTitle.vue'

  export default defineComponent({
    components: {
      BaseTable,
      BaseTableHead,
      CellTitle,
      CellActions,
      CellTrackNumber,
      CellAlbum,
      CellArtist,
      CellDuration,
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

    setup(props) {
      const playerStore = usePlayerStore()

      const isActive = (item: Track, index: number) => {
        return props.activeBy === 'index'
          ? index === playerStore.queueIndex
          : item.id === playerStore.trackId
      }

      const handlePlay = (index: number) => {
        if (props.playStrategy) return props.playStrategy(index)

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

      return {
        playerStore,
        isActive,
        handlePlay,
        dragstart,
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
