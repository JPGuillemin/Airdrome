// RowActionsMenu.vue
<template>
  <Teleport to="body">
    <div v-if="visible" class="row-actions-modal-wrapper">
      <div class="modal-overlay" @click="close" />
      <div class="modal-dialog p-3">
        <div class="modal-content" @click="onClickInside">
          <div class="modal-header mb-2">
            <h5 class="modal-title text-truncate fs-6">
              {{ track.title || 'Track Options' }}
            </h5>
            <button type="button" class="btn-close" aria-label="Close" @click="close" />
          </div>

          <div class="modal-body py-1">
            <TrackMenuItem v-if="!track.isUnavailable" icon="plus" class="on-top" @click="setNextInQueue()">
              Next
            </TrackMenuItem>
            <TrackMenuItem v-if="!track.isUnavailable" icon="plus" class="on-top" @click="addToQueue()">
              Queue
            </TrackMenuItem>

            <!-- Conditional playlist action -->
            <TrackMenuItem
              v-if="!isPlaylistView"
              icon="plus"
              class="on-top"
              @click="showPlaylistSelect = true"
            >
              Playlist
            </TrackMenuItem>

            <TrackMenuItem
              v-if="isPlaylistView"
              icon="x"
              variant="danger"
              class="on-top"
              @click="$emit('remove'); close()"
            >
              Remove
            </TrackMenuItem>

            <TrackMenuItem v-if="!track.isStream" :icon="isFavourite ? 'heart-fill' : 'heart'" class="on-top" @click.stop="toggleFavourite()">
              Like
            </TrackMenuItem>
            <TrackMenuItem v-if="!track.isStream" icon="download" class="on-top" @click="download()">
              Download
            </TrackMenuItem>

            <slot :item="track" />
          </div>
        </div>
      </div>
    </div>

    <!-- Sub-modal for Playlist Selection -->
    <div v-if="showPlaylistSelect" class="row-actions-modal-wrapper">
      <div class="modal-overlay playlist-overlay" @click="showPlaylistSelect = false" />
      <div class="modal-dialog p-3 playlist-dialog-box">
        <div class="modal-content">
          <div class="modal-header mb-2">
            <h5 class="modal-title fs-6">Add to Playlist</h5>
            <button type="button" class="btn-close" aria-label="Close" @click="showPlaylistSelect = false" />
          </div>
          <div class="modal-body py-1">
            <div
              v-for="item in playlistStore.playlists"
              :key="item.id"
              class="playlist-item text-truncate"
              @click="addToPlaylist(item.id)"
            >
              {{ item.name }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts">
  import { defineComponent, ref, computed, inject } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlaylistStore } from '@/library/playlist/store'
  import { usePlayerStore } from '@/player/store'
  import { Track } from '@/shared/api'

  export default defineComponent({
    props: {
      track: { type: Object, required: true },
      isPlaylistView: { type: Boolean, default: false },
    },

    emits: ['remove'],

    setup(props, { emit }) {
      const favouriteStore = useFavouriteStore()
      const playlistStore = usePlaylistStore()
      const playerStore = usePlayerStore()
      const $api = inject('$api') as any

      const visible = ref(false)
      const showPlaylistSelect = ref(false)

      const isFavourite = computed(() => !!favouriteStore.tracks[props.track.id])

      const toggleFavourite = () => favouriteStore.toggle('track', props.track.id)

      const download = () => {
        if (!$api) {
          console.error('$api is not available')
          return
        }
        window.location.href = $api.getDownloadUrl(props.track.id)
        close()
      }

      const setNextInQueue = () => {
        playerStore.setNextInQueue([props.track as Track])
        close()
      }
      const addToQueue = () => {
        playerStore.addToQueue([props.track as Track])
        close()
      }
      const addToPlaylist = (playlistId: string) => {
        showPlaylistSelect.value = false
        playlistStore.addTracks(playlistId, [props.track.id])
        close()
      }

      const open = () => {
        visible.value = true
      }

      const close = () => {
        visible.value = false
        showPlaylistSelect.value = false
      }

      const onClickInside = (event: Event) => {
        const target = event.target as (Element | null)
        // Items injected through the default slot (Select, Remove...) don't call close() themselves.
        // When an item opens the playlist sub-modal, the menu must stay open.
        const item = target?.closest('.modal-body > *')
        if (item && item.tagName !== 'HR' && !showPlaylistSelect.value) {
          close()
        }
      }

      const openAt = (_point?: any) => {
        open()
      }

      return {
        visible,
        favouriteStore,
        playlistStore,
        playerStore,
        showPlaylistSelect,
        isFavourite,
        toggleFavourite,
        download,
        setNextInQueue,
        addToQueue,
        addToPlaylist,
        open,
        close,
        openAt,
        onClickInside,
      }
    },
  })
</script>

<style scoped>
  .row-actions-modal-wrapper {
    position: relative;
    z-index: 9999;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 9999;
  }

  .playlist-overlay {
    z-index: 10001;
  }

  .modal-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: var(--theme-elevation-1);
    border-radius: 12px;
    max-width: 320px;
    width: 85%;
    z-index: 10000;
    border: 1px solid var(--theme-elevation-2);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  }

  .playlist-dialog-box {
    z-index: 10002;
    max-width: 320px;
  }

  .modal-header, .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 60vh;
    overflow-y: auto;
  }

  .playlist-item {
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 6px;
  }

  .playlist-item:hover {
    background-color: var(--bs-gray-200);
    color: var(--bs-primary);
  }
</style>
