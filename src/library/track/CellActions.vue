<template>
  <td class="text-end" @click.stop="">
    <OverflowMenu>
      <DropdownItem v-if="!track.isUnavailable" icon="plus" @click="setNextInQueue()">
        Next
      </DropdownItem>
      <DropdownItem v-if="!track.isUnavailable" icon="plus" @click="addToQueue()">
        Queue
      </DropdownItem>

      <!-- Conditional playlist action -->
      <DropdownItem
        v-if="!isPlaylistView"
        icon="plus"
        @click="showPlaylistSelect = true"
      >
        Playlist
      </DropdownItem>

      <DropdownItem
        v-if="isPlaylistView"
        icon="x"
        variant="danger"
        @click="$emit('remove')"
      >
        Remove
      </DropdownItem>

      <DropdownItem v-if="!track.isStream" :icon="isFavourite ? 'heart-fill' : 'heart'" @click.stop="toggleFavourite()">
        Like
      </DropdownItem>
      <DropdownItem v-if="!track.isStream" icon="download" @click="download()">
        Download
      </DropdownItem>

      <slot :item="track" />
    </OverflowMenu>
    <div v-if="showPlaylistSelect" class="playlist-dialog p-3" @click.self="showPlaylistSelect = false">
      <div class="playlist-box">
        <div
          v-for="item in playlistStore.playlists"
          :key="item.id"
          class="playlist-item"
          @click="addToPlaylist(item.id)"
        >
          {{ item.name }}
        </div>
      </div>
    </div>
  </td>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlaylistStore } from '@/library/playlist/store'
  import { usePlayerStore } from '@/player/store'
  import { Track } from '@/shared/api'

  export default defineComponent({
    props: {
      track: { type: Object, required: true },
      isPlaylistView: { type: Boolean, default: false },
    },
    setup() {
      return {
        favouriteStore: useFavouriteStore(),
        playlistStore: usePlaylistStore(),
        playerStore: usePlayerStore(),
      }
    },
    data() {
      return {
        showPlaylistSelect: false,
      }
    },
    computed: {
      isFavourite(): boolean {
        return !!this.favouriteStore.tracks[this.track.id]
      },
    },
    methods: {
      toggleFavourite() {
        return this.favouriteStore.toggle('track', this.track.id)
      },
      download() {
        window.location.href = this.$api.getDownloadUrl(this.track.id)
      },
      setNextInQueue() {
        return this.playerStore.setNextInQueue([this.track as Track])
      },
      addToQueue() {
        return this.playerStore.addToQueue([this.track as Track])
      },
      addToPlaylist(playlistId: string) {
        this.showPlaylistSelect = false
        return this.playlistStore.addTracks(playlistId, [this.track.id])
      },
    }
  })
</script>
<style scoped>
  .on-top {
    position: absolute;
    z-index: 3000 !important;
  }
  .playlist-dialog {
    position: fixed;
    top: 65%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100vw; /* covers full screen for click-away */
    height: 100vh;
    background: rgba(0,0,0,0.15); /* optional semi-transparent overlay */
  }

  .playlist-box {
    background: var(--theme-elevation-1);
    border-radius: 12px;
    min-width: 160px;
    max-width: 90vw;
    max-height: 70vh;
    overflow-y: auto;
    padding: 8px 0;
    box-shadow: 0 6px 22px rgba(0,0,0,0.18);
    text-align: left;
  }

  .playlist-item {
    text-align: left;
    padding: 10px 16px;
    cursor: pointer;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  .playlist-item:hover {
    background-color: var(--bs-gray-200);
  }
</style>
