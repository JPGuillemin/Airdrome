<template>
  <td class="text-end" @click.stop="">
    <OverflowMenu variant="transparent">
      <DropdownItem v-if="!track.isUnavailable" icon="plus" class="on-top" @click="setNextInQueue()">
        Next
      </DropdownItem>
      <DropdownItem v-if="!track.isUnavailable" icon="plus" class="on-top" @click="addToQueue()">
        Queue
      </DropdownItem>

      <!-- Conditional playlist action -->
      <DropdownItem
        v-if="!isPlaylistView"
        icon="plus"
        class="on-top"
        @click="showPlaylistSelect = true"
      >
        Playlist
      </DropdownItem>

      <DropdownItem
        v-if="isPlaylistView"
        icon="x"
        variant="danger"
        class="on-top"
        @click="$emit('remove')"
      >
        Remove
      </DropdownItem>

      <DropdownItem v-if="!track.isStream" :icon="isFavourite ? 'heart-fill' : 'heart'" class="on-top" @click.stop="toggleFavourite()">
        Like
      </DropdownItem>
      <DropdownItem v-if="!track.isStream" icon="download" class="on-top" @click="download()">
        Download
      </DropdownItem>

      <slot :item="track" />
    </OverflowMenu>
    <Teleport to="body">
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
    </Teleport>
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
  .playlist-dialog {
    position: fixed;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 3000; /* why not */
  }

  .playlist-box {
    background: var(--theme-elevation-1);
    border-radius: 12px;
    min-width: 160px;
    max-width: 90vw;
    max-height: 200px;
    overflow-y: auto;
    scrollbar-color: rgba(0,0,0,0.3) transparent;
    padding: 8px 0;
    border: 1px solid var(--theme-elevation-2);
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    text-align: left;
  }

  .playlist-box::-webkit-scrollbar-track {
    background: transparent;
  }

  .playlist-box::-webkit-scrollbar-button {
    display: none; /* remove arrows */
    border-radius: 10px;
  }

  .playlist-box::-webkit-scrollbar-thumb {
    background-color: rgba(0,0,0,0.3);
    border-radius: 10px;
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
