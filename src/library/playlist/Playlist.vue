<template>
  <div v-if="playlist" class="main-content">
    <div class="custom-wrapper">
      <Custom :image="playlist.image" :hover="'Play/Pause'" class="cursor-pointer" @click="playNow">
        <div class="custom-title-wrapper">
          <h1 class="custom-title">
            {{ playlist.name }}
          </h1>
        </div>
        <div class="custom-info">
          <span class="text-nowrap">
            <strong>{{ playlist.trackCount }}</strong> tracks
          </span>
          <span class="mx-2">•</span>
          <strong>{{ formatDuration(playlist.duration) }}</strong>
          <template v-if="playlist.isPublic">
            <span class="mx-2">•</span>
            <span class="badge bg-secondary rounded-pill">Public</span>
          </template>
        </div>

        <OverflowFade v-if="playlist.comment" class="mt-3">
          {{ playlist.comment }}
        </OverflowFade>

        <div class="text-nowrap mt-3">
          <b-button
            variant="transparent"
            class="me-2"
            :disabled="playlist.tracks.length === 0"
            title="Shuffle"
            @click="shuffleNow()"
          >
            <Icon icon="shuffle" />
          </b-button>
          <b-button
            variant="transparent"
            class="me-2"
            :disabled="playlist.tracks.length === 0"
            title="Reload"
            @click="reloadPlaylist()"
          >
            <Icon icon="reload" />
          </b-button>
          <OverflowMenu variant="transparent">
            <DropdownItem
              icon="edit"
              :disabled="playlist.isReadOnly"
              class="on-top"
              @click="openEditModal"
            >
              Edit
            </DropdownItem>
            <hr class="dropdown-divider">
            <DropdownItem
              icon="x"
              variant="danger"
              :disabled="playlist.isReadOnly"
              class="on-top"
              @click="deletePlaylist()"
            >
              Delete
            </DropdownItem>
          </OverflowMenu>
        </div>
      </Custom>
    </div>

    <div class="content-wrapper">
      <TrackList
        v-if="visibleTracks.length > 0"
        :tracks="visibleTracks"
        class="mt-3"
        :is-playlist-view="true"
        @remove-track="removeTrack"
      >
        <template #context-menu="{ index }">
          <hr class="dropdown-divider">
          <DropdownItem
            icon="x"
            variant="danger"
            @click="removeTrack(index)"
          >
            Remove
          </DropdownItem>
        </template>
      </TrackList>
      <EmptyIndicator v-else-if="!loadingTracks" />
      <InfiniteLoader :loading="loadingTracks" :has-more="hasMore" @load-more="loadMore" />
    </div>

    <div v-if="showEditModal" class="modal-overlay" @click="closeEditModal" />
    <div v-if="showEditModal" class="modal-dialog p-3">
      <div class="modal-content">
        <div class="modal-header mb-3">
          <h5 class="modal-title">
            Edit Playlist
          </h5>
          <button class="btn-close" @click="closeEditModal" />
        </div>
        <div>
          <div class="mb-3">
            <label class="form-label">Name</label>
            <input v-model="editPlaylist.name" type="text" class="form-control">
          </div>
          <div class="mb-3">
            <label class="form-label">Comment</label>
            <textarea v-model="editPlaylist.comment" class="form-control" />
          </div>
          <div class="mb-3">
            <label class="form-label">Public</label>
            <SwitchInput v-model="editPlaylist.isPublic" />
          </div>
        </div>
        <div class="modal-footer">
          <b-button variant="primary" class="mx-2" @click="confirmEdit">
            Save
          </b-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import TrackList from '@/library/track/TrackList.vue'
  import SwitchInput from '@/shared/components/SwitchInput.vue'
  import OverflowFade from '@/shared/components/OverflowFade.vue'
  import InfiniteLoader from '@/shared/components/InfiniteLoader.vue'
  import EmptyIndicator from '@/shared/components/EmptyIndicator.vue'
  import OverflowMenu from '@/shared/components/OverflowMenu.vue'
  import DropdownItem from '@/shared/components/DropdownItem.vue'
  import Icon from '@/shared/components/Icon.vue'
  import Custom from '@/shared/components/Custom.vue'
  import { usePlaylistStore } from '@/library/playlist/store'
  import { usePlayerStore } from '@/player/store'
  import { useLoader } from '@/shared/loader'
  import { formatDuration } from '@/shared/utils'
  import { BButton } from 'bootstrap-vue-3'

  export default defineComponent({
    components: {
      TrackList,
      SwitchInput,
      OverflowFade,
      InfiniteLoader,
      EmptyIndicator,
      OverflowMenu,
      DropdownItem,
      Icon,
      Custom,
      BButton,
    },
    props: { id: { type: String, required: true } },
    setup() {
      return {
        playlistStore: usePlaylistStore(),
        playerStore: usePlayerStore(),
        formatDuration,
      }
    },
    data() {
      return {
        playlist: null as any,
        visibleTracks: [] as any[],
        nextIndex: 0,
        chunkSize: 50,
        hasMore: true,
        loadingTracks: false,
        showEditModal: false,
        editPlaylist: {} as any,
      }
    },
    watch: {
      id: {
        immediate: true,
        handler(value: string) {
          this.fetchPlaylist(value)
        },
      },
    },
    methods: {
      appendNextChunk() {
        if (!this.playlist?.tracks) return
        const nextChunk = this.playlist.tracks.slice(this.nextIndex, this.nextIndex + this.chunkSize)
        this.visibleTracks.push(...nextChunk)
        this.nextIndex += nextChunk.length
        this.hasMore = this.nextIndex < this.playlist.tracks.length
      },
      loadMore() {
        if (this.loadingTracks || !this.hasMore) return
        this.loadingTracks = true
        setTimeout(() => {
          this.appendNextChunk()
          this.loadingTracks = false
        }, 300)
      },
      playNow() {
        if (!this.playlist?.tracks?.length) return
        const currentTrack = this.playerStore.track
        if (currentTrack && this.playlist.tracks.some(t => t.id === currentTrack.id)) {
          return this.playerStore.playPause()
        }
        return this.playerStore.playNow(this.playlist.tracks)
      },
      shuffleNow() {
        return this.playerStore.shuffleNow(this.playlist.tracks)
      },
      removeTrack(index: number) {
        this.playlist.tracks.splice(index, 1)
        this.visibleTracks.splice(index, 1)
        return this.playlistStore.removeTrack(this.id, index)
      },
      async fetchPlaylist(id: string) {
        const loader = useLoader()
        loader.showLoading()
        try {
          const data = await this.$api.getPlaylist(id)
          this.playlist = data
          this.visibleTracks = []
          this.nextIndex = 0
          this.hasMore = true
          this.appendNextChunk()
        } catch (err) {
          console.error(err)
        } finally {
          loader.hideLoading()
        }
      },
      async reloadPlaylist() {
        await this.fetchPlaylist(this.id)
        this.$router.replace({
          name: this.$route.name as string,
          params: { ...(this.$route.params || {}) },
          query: { ...(this.$route.query || {}), t: Date.now().toString() },
        })
      },
      deletePlaylist() {
        return this.playlistStore.delete(this.id).then(() => {
          this.$router.replace({ name: 'playlists' })
        })
      },

      // --- Edit Modal ---
      openEditModal() {
        // Make a shallow copy for editing
        this.editPlaylist = {
          name: this.playlist.name,
          comment: this.playlist.comment,
          isPublic: this.playlist.isPublic,
        }
        this.showEditModal = true
      },
      closeEditModal() {
        this.showEditModal = false
      },
      confirmEdit() {
        if (!this.editPlaylist.name?.trim()) {
          alert('Name cannot be empty')
          return
        }

        // Apply changes to the local playlist
        this.playlist.name = this.editPlaylist.name
        this.playlist.comment = this.editPlaylist.comment
        this.playlist.isPublic = this.editPlaylist.isPublic

        // Persist to store / backend
        this.playlistStore.update(this.playlist) // <-- pass full object

        this.showEditModal = false
      },
    },
  })
</script>

<style scoped>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0,0,0,0.5);
    z-index: 1000;
  }

  .modal-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: var(--theme-elevation-1);
    border-radius: 6px;
    max-width: 600px;
    width: auto;
    z-index: 9999;
    border: 1px solid var(--theme-elevation-2);
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  }

  .modal-header,
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .modal-footer {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .btn-close {
    background: none;
    border: none;
    font-size: 1.2rem;
  }
</style>
