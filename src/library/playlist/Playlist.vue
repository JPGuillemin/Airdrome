<template>
  <div v-if="playlist" class="main-content">
    <div class="header-wrapper">
      <Custom :image="playlist.image" :hover="'Play/Pause'" class="cursor-pointer" @click="playNow">
        <div class="header-title-wrapper">
          <div class="header-title">
            {{ playlist.name }}
          </div>
        </div>
        <div class="header-info">
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
          <OverflowMenu direction="up" variant="transparent">
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
    <Teleport to="body">
      <EditPlaylistModal
        v-if="showEditModal"
        :playlist="playlist"
        @update-playlist="applyPlaylistUpdate"
        @close="showEditModal = false"
      />
    </Teleport>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import TrackList from '@/library/track/TrackList.vue'
  import EditPlaylistModal from '@/library/playlist/EditPlaylistModal.vue'
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
      EditPlaylistModal,
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

        // modal visibility only
        showEditModal: false,
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
        this.showEditModal = true
      },

      applyPlaylistUpdate(updated: any) {
        // update local playlist
        this.playlist = { ...this.playlist, ...updated }

        // persist
        this.playlistStore.update(this.playlist)
      },
    },
  })
</script>
