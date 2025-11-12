<template>
  <div v-if="playlist" class="main-content">
    <div class="poster-wrapper">
      <Poster :image="playlist.image" :hover="'Play/Pause'" class="cursor-pointer" @click="playNow">
        <div class="poster-title-wrapper">
          <h1 class=" poster-title">
            {{ playlist.name }}
          </h1>
        </div>
        <div class="poster-info">
          <span class="text-nowrap">
            <strong>{{ playlist.trackCount }}</strong> tracks
          </span>
          <span class="mx-2">•</span>
          <strong>{{ formatDuration(playlist.duration) }}</strong>
          <template v-if="playlist.isPublic">
            <span class="mx-2">•</span>
            <span class="badge bg-secondary rounded-pill">
              Public
            </span>
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
              @click="showEditModal = true"
            >
              Edit
            </DropdownItem>
            <hr class="dropdown-divider">
            <DropdownItem
              icon="x"
              variant="danger"
              :disabled="playlist.isReadOnly"
              @click="deletePlaylist()"
            >
              Delete
            </DropdownItem>
          </OverflowMenu>
        </div>
      </Poster>
    </div>
    <div class="content-wrapper">
      <TrackList
        v-if="visibleTracks.length > 0"
        :tracks="visibleTracks"
        class="mt-3"
      >
        <template #context-menu="{ index }">
          <hr class="dropdown-divider">
          <DropdownItem
            icon="x"
            variant="danger"
            :disabled="playlist.isReadOnly"
            @click="removeTrack(index)"
          >
            Remove
          </DropdownItem>
        </template>
      </TrackList>
      <EmptyIndicator v-else-if="!loadingTracks" />
      <InfiniteLoader
        :loading="loadingTracks"
        :has-more="hasMore"
        @load-more="loadMore"
      />
    </div>

    <EditModal v-model="showEditModal" :item="playlist" @confirm="updatePlaylist">
      <template #title>
        Edit playlist
      </template>
      <template #default="{ item }">
        <div class="mb-3">
          <label class="form-label">Name</label>
          <input v-model="item.name" class="form-control" type="text">
        </div>
        <div class="mb-3">
          <label class="form-label">Comment</label>
          <textarea v-model="item.comment" class="form-control" />
        </div>
        <div class="mb-3">
          <label class="form-label">Public</label>
          <SwitchInput v-model="item.isPublic" />
        </div>
      </template>
    </EditModal>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import TrackList from '@/library/track/TrackList.vue'
  import EditModal from '@/shared/components/EditModal.vue'
  import { usePlaylistStore } from '@/library/playlist/store'
  import SwitchInput from '@/shared/components/SwitchInput.vue'
  import { formatDuration } from '@/shared/utils'
  import { usePlayerStore } from '@/player/store'
  import OverflowFade from '@/shared/components/OverflowFade.vue'
  import { useLoader } from '@/shared/loader'
  import InfiniteLoader from '@/shared/components/InfiniteLoader.vue'
  import EmptyIndicator from '@/shared/components/EmptyIndicator.vue'
  import OverflowMenu from '@/shared/components/OverflowMenu.vue'
  import DropdownItem from '@/shared/components/DropdownItem.vue'
  import Icon from '@/shared/components/Icon.vue'
  import Poster from '@/shared/components/Poster.vue'

  export default defineComponent({
    components: {
      OverflowFade,
      SwitchInput,
      TrackList,
      EditModal,
      InfiniteLoader,
      EmptyIndicator,
      OverflowMenu,
      DropdownItem,
      Icon,
      Poster,
    },
    props: {
      id: { type: String, required: true },
    },
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
        showEditModal: false,

        // For sliced track loading
        visibleTracks: [] as any[],
        nextIndex: 0,
        chunkSize: 50,
        hasMore: true,
        loadingTracks: false,
      }
    },
    watch: {
      id: {
        immediate: true,
        async handler(value: string) {
          const loader = useLoader()
          loader.showLoading()
          try {
            this.playlist = null
            this.visibleTracks = []
            this.nextIndex = 0
            this.hasMore = true

            this.playlist = await this.$api.getPlaylist(value)
            this.appendNextChunk()
          } finally {
            loader.hideLoading()
          }
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
        const playlist = this.playlist
        if (!playlist || !playlist.tracks?.length) return
        const currentTrack = this.playerStore.track
        const isPlaylistTrack =
          !!currentTrack &&
          playlist.tracks.some(t => t.id === currentTrack.id)
        if (isPlaylistTrack) {
          return this.playerStore.playPause()
        }
        return this.playerStore.playNow(playlist.tracks)
      },
      shuffleNow() {
        return this.playerStore.shuffleNow(this.playlist.tracks)
      },
      removeTrack(index: number) {
        const globalIndex = index // visibleTracks index matches playlist order
        this.playlist.tracks.splice(globalIndex, 1)
        this.visibleTracks.splice(globalIndex, 1)
        return this.playlistStore.removeTrack(this.id, globalIndex)
      },
      async updatePlaylist(value: any) {
        const loader = useLoader()
        loader.showLoading()
        try {
          this.playlist = value
          return await this.playlistStore.update(this.playlist)
        } finally {
          loader.hideLoading()
        }
      },
      deletePlaylist() {
        return this.playlistStore.delete(this.id).then(() => {
          this.$router.replace({ name: 'playlists' })
        })
      },
      reloadPlaylist() {
        this.$router.replace({
          name: this.$route.name as string,
          params: { ...(this.$route.params || {}) },
          query: { ...(this.$route.query || {}), t: Date.now().toString() }
        })
      },
    },
  })
</script>
