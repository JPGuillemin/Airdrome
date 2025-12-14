<template>
  <div v-if="playlist" class="main-content">
    <ConfirmDialog ref="confirmDialog" />
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
          <OverflowMenu direction="up" variant="transparent" @click.stop>
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
              @click.stop.prevent="deletePlaylist()"
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
  import { defineComponent, ref, watch, inject } from 'vue'
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
  import ConfirmDialog, { ConfirmDialogExpose } from '@/shared/components/ConfirmDialog.vue'
  import { useRouter, useRoute } from 'vue-router'

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
      ConfirmDialog,
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

      const playNow = () => {
        if (!playlist.value?.tracks?.length) return
        const currentTrack = playerStore.track
        if (currentTrack && playlist.value.tracks.some((t: any) => t.id === currentTrack.id)) {
          return playerStore.playPause()
        }
        return playerStore.playNow(playlist.value.tracks)
      }

      const shuffleNow = () => playerStore.shuffleNow(playlist.value.tracks)

      const removeTrack = (index: number) => {
        playlist.value.tracks.splice(index, 1)
        visibleTracks.value.splice(index, 1)
        return playlistStore.removeTrack(props.id, index)
      }

      const fetchPlaylist = async(id: string) => {
        loader.showLoading()
        try {
          const data = await api.getPlaylist(id)
          playlist.value = data
          visibleTracks.value = []
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
        confirmDialog,
        appendNextChunk,
        loadMore,
        playNow,
        shuffleNow,
        removeTrack,
        fetchPlaylist,
        reloadPlaylist,
        deletePlaylist,
        openEditModal,
        applyPlaylistUpdate,
      }
    },
  })
</script>
