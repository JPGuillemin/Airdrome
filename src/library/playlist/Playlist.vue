// Playlist.vue
<template>
  <div v-if="playlist" class="main-content">
    <ConfirmDialog ref="confirmDialog" />
    <div class="header-wrapper">
      <Header :image="playlist.image" :hover="'Play/Pause'" class="cursor-pointer can-select" @click="playPause">
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

        <OverflowFade v-if="playlist.comment" class="mt-2">
          {{ playlist.comment }}
        </OverflowFade>

        <div class="text-nowrap">
          <button
            v-longpress-tooltip
            class="btn btn-transparent header-buttons"
            :disabled="playlist.tracks.length === 0"
            title="Playlist Play"
            @click="playNow()"
          >
            <Icon icon="recycle" />
          </button>
          <button
            v-longpress-tooltip
            class="btn btn-transparent header-buttons"
            :disabled="playlist.tracks.length === 0"
            title="Shuffle"
            @click="shuffleNow()"
          >
            <Icon icon="random" />
          </button>
          <button
            v-if="selectedIndexes.length > 0"
            v-longpress-tooltip
            class="btn btn-transparent header-buttons"
            :disabled="playlist.isReadOnly"
            :title="`Remove ${selectedIndexes.length} selected`"
            @click.stop="removeSelected()"
          >
            <Icon icon="trash" />
          </button>
          <OverflowMenu direction="up" variant="transparent" @click.stop>
            <DropdownItem
              icon="reload"
              :disabled="playlist.tracks.length === 0"
              class="on-top"
              @click="reloadPlaylist()"
            >
              Reload
            </DropdownItem>
            <DropdownItem
              icon="edit"
              :disabled="playlist.isReadOnly"
              class="on-top"
              @click="openEditModal"
            >
              Edit
            </DropdownItem>
            <DropdownItem
              icon="x"
              variant="danger"
              :disabled="playlist.isReadOnly"
              class="on-top"
              @click.stop.prevent="deletePlaylist()"
            >
              Delete
            </DropdownItem>
          </OverflowMenu>
        </div>
      </Header>
    </div>

    <div class="content-wrapper">
      <TrackList
        v-if="visibleTracks.length > 0"
        :tracks="visibleTracks"
        class="mt-3"
        :is-playlist-view="true"
        :selectable="selectedIndexes.length > 0"
        :selected="selectedIndexes"
        :selection-total="playlist.tracks.length"
        @toggle-select="toggleSelect"
        @toggle-select-all="toggleSelectAll"
        @remove-track="removeTrack"
      >
        <template #actions="{ index }">
          <DropdownItem
            icon="check"
            :disabled="playlist.isReadOnly"
            @click="toggleSelect(index)"
          >
            {{ selectedIndexes.includes(index) ? 'Deselect' : 'Select' }}
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
  import { defineComponent, ref, watch, inject, nextTick } from 'vue'
  import TrackList from '@/library/track/TrackList.vue'
  import EditPlaylistModal from '@/library/playlist/EditPlaylistModal.vue'
  import OverflowFade from '@/shared/components/OverflowFade.vue'
  import InfiniteLoader from '@/shared/components/InfiniteLoader.vue'
  import EmptyIndicator from '@/shared/components/EmptyIndicator.vue'
  import OverflowMenu from '@/shared/components/OverflowMenu.vue'
  import DropdownItem from '@/shared/components/DropdownItem.vue'
  import Icon from '@/shared/components/Icon.vue'
  import { usePlaylistStore } from '@/library/playlist/store'
  import { usePlayerStore } from '@/player/store'
  import { useLoader } from '@/shared/loader'
  import { formatDuration } from '@/shared/utils'
  import ConfirmDialog, { ConfirmDialogExpose } from '@/shared/components/ConfirmDialog.vue'
  import { useRouter, useRoute } from 'vue-router'
  import { longPressTooltip } from '@/shared/tooltips'

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
      ConfirmDialog,
    },

    directives: {
      'longpress-tooltip': longPressTooltip
    },

    props: { id: { type: String, required: true } },

    setup(props) {
      const playlistStore = usePlaylistStore()
      const playerStore = usePlayerStore()
      const playlist = ref<any>(null)
      const visibleTracks = ref<any[]>([])
      const nextIndex = ref(0)
      const chunkSize = ref(50)
      const hasMore = ref(true)
      const loadingTracks = ref(false)
      const showEditModal = ref(false)
      // Selection is index-based: the same track can appear several times in a playlist
      const selectedIndexes = ref<number[]>([])
      const confirmDialog = ref<ConfirmDialogExpose | null>(null)
      const api = inject('$api') as any
      const loader = useLoader()
      const router = useRouter()
      const route = useRoute()

      const appendNextChunk = () => {
        if (!playlist.value?.tracks) return
        const nextChunk = playlist.value.tracks.slice(nextIndex.value, nextIndex.value + chunkSize.value)
        visibleTracks.value.push(...nextChunk)
        nextIndex.value += nextChunk.length
        hasMore.value = nextIndex.value < playlist.value.tracks.length
      }

      const loadMore = () => {
        if (loadingTracks.value || !hasMore.value) return
        loadingTracks.value = true
        setTimeout(() => {
          appendNextChunk()
          loadingTracks.value = false
        }, 300)
      }

      const playPause = () => {
        if (!playlist.value?.tracks?.length) return
        const currentTrack = playerStore.track
        if (currentTrack && playlist.value.tracks.some((t: any) => t.id === currentTrack.id)) {
          return playerStore.playPause()
        }
        return playerStore.playNow(playlist.value.tracks)
      }

      const playNow = () => {
        if (!playlist.value?.tracks?.length) return
        const currentTrack = playerStore.track
        const firstTrack = playlist.value.tracks[0]
        if (currentTrack && firstTrack && currentTrack.id === firstTrack.id) return
        return playerStore.playNow(playlist.value.tracks)
      }

      const shuffleNow = () => {
        playerStore.shuffleNow(playlist.value.tracks)
        nextTick(() => router.push({ name: 'queue' }))
      }

      const toggleSelect = (index: number) => {
        selectedIndexes.value = selectedIndexes.value.includes(index)
          ? selectedIndexes.value.filter(i => i !== index)
          : [...selectedIndexes.value, index]
      }

      // Selects every track of the playlist, including ones not loaded yet by the infinite loader
      const toggleSelectAll = () => {
        const total = playlist.value.tracks.length
        selectedIndexes.value = selectedIndexes.value.length >= total
          ? []
          : Array.from({ length: total }, (_, i) => i)
      }

      const removeTrack = (index: number) => {
        playlist.value.tracks.splice(index, 1)
        visibleTracks.value.splice(index, 1)
        playlist.value.trackCount = playlist.value.tracks.length
        // keep the selection aligned with the shifted indexes
        selectedIndexes.value = selectedIndexes.value
          .filter(i => i !== index)
          .map(i => (i > index ? i - 1 : i))
        return playlistStore.removeTrack(props.id, index)
      }

      const removeSelected = async() => {
        if (!confirmDialog.value || !selectedIndexes.value.length) return
        const count = selectedIndexes.value.length
        const userConfirmed = await confirmDialog.value.open(
          'Remove',
          `About to remove ${count} track${count > 1 ? 's' : ''} : continue?`
        )
        if (!userConfirmed) return

        // highest index first, so earlier removals don't shift the later ones
        const indexes = [...selectedIndexes.value].sort((a, b) => b - a)
        indexes.forEach(i => {
          playlist.value.tracks.splice(i, 1)
          visibleTracks.value.splice(i, 1)
        })
        playlist.value.trackCount = playlist.value.tracks.length
        selectedIndexes.value = []
        await playlistStore.removeTracks(props.id, indexes)
      }

      const fetchPlaylist = async(id: string) => {
        loader.showLoading()
        try {
          const data = await api.getPlaylist(id)
          playlist.value = data
          visibleTracks.value = []
          selectedIndexes.value = []
          nextIndex.value = 0
          hasMore.value = true
          appendNextChunk()
        } catch (err) {
          console.error(err)
        } finally {
          loader.hideLoading()
        }
      }

      const reloadPlaylist = async() => {
        await fetchPlaylist(props.id)
        router.replace({
          name: route.name as string,
          params: { ...route.params },
          query: { ...route.query, t: Date.now().toString() },
        })
      }

      const deletePlaylist = async() => {
        if (!confirmDialog.value) return

        const userConfirmed = await confirmDialog.value.open(
          'Remove',
          'About to remove playlist : continue?'
        )
        if (!userConfirmed) return
        await playlistStore.delete(props.id)
        router.replace({ name: 'playlists' })
      }

      const openEditModal = () => {
        showEditModal.value = true
      }

      const applyPlaylistUpdate = (updated: any) => {
        playlist.value = { ...playlist.value, ...updated }
        playlistStore.update(playlist.value)
      }

      watch(
        () => props.id,
        (value) => fetchPlaylist(value),
        { immediate: true }
      )

      return {
        playlistStore,
        playerStore,
        formatDuration,
        playlist,
        visibleTracks,
        nextIndex,
        chunkSize,
        hasMore,
        loadingTracks,
        showEditModal,
        selectedIndexes,
        confirmDialog,
        appendNextChunk,
        loadMore,
        playPause,
        playNow,
        shuffleNow,
        toggleSelect,
        toggleSelectAll,
        removeTrack,
        removeSelected,
        fetchPlaylist,
        reloadPlaylist,
        deletePlaylist,
        openEditModal,
        applyPlaylistUpdate,
      }
    },
  })
</script>
