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
            :title="'Remove ' + selectedIndexes.length + ' selected'"
            @click.stop="removeSelected()"
          >
            <Icon icon="trash" />
          </button>
          <OverflowMenu direction="up" variant="transparent" @click.stop>
            <TrackMenuItem
              icon="reload"
              :disabled="playlist.tracks.length === 0"
              class="on-top"
              @click="reloadPlaylist()"
            >
              Reload
            </TrackMenuItem>
            <TrackMenuItem
              icon="edit"
              :disabled="playlist.isReadOnly"
              class="on-top"
              @click="openEditModal"
            >
              Edit
            </TrackMenuItem>
            <TrackMenuItem
              icon="x"
              variant="danger"
              :disabled="playlist.isReadOnly"
              class="on-top"
              @click.stop.prevent="deletePlaylist()"
            >
              Delete
            </TrackMenuItem>
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
        <template #actions="slotProps">
          <TrackMenuItem
            icon="check"
            :disabled="playlist.isReadOnly"
            @click="toggleSelect(slotProps.index)"
          >
            <template v-if="selectedIndexes.indexOf(slotProps.index) !== -1">
              Deselect
            </template>
            <template v-else>
              Select
            </template>
          </TrackMenuItem>
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

<script>
  import { defineComponent, ref, watch, inject, nextTick } from 'vue'
  import TrackList from '@/library/track/TrackList.vue'
  import EditPlaylistModal from '@/library/playlist/EditPlaylistModal.vue'
  import OverflowFade from '@/shared/components/OverflowFade.vue'
  import InfiniteLoader from '@/shared/components/InfiniteLoader.vue'
  import EmptyIndicator from '@/shared/components/EmptyIndicator.vue'
  import OverflowMenu from '@/shared/components/OverflowMenu.vue'
  import TrackMenuItem from '@/shared/components/TrackMenuItem.vue'
  import Icon from '@/shared/components/Icon.vue'
  import { usePlaylistStore } from '@/library/playlist/store'
  import { usePlayerStore } from '@/player/store'
  import { useLoader } from '@/shared/loader'
  import { formatDuration } from '@/shared/utils'
  import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
  import { useRouter, useRoute } from 'vue-router'
  import { longPressTooltip } from '@/shared/tooltips'

  export default defineComponent({
    components: {
      TrackList: TrackList,
      EditPlaylistModal: EditPlaylistModal,
      OverflowFade: OverflowFade,
      InfiniteLoader: InfiniteLoader,
      EmptyIndicator: EmptyIndicator,
      OverflowMenu: OverflowMenu,
      TrackMenuItem: TrackMenuItem,
      Icon: Icon,
      ConfirmDialog: ConfirmDialog,
    },

    directives: {
      'longpress-tooltip': longPressTooltip
    },

    props: {
      /** Playlist identifier from the route. */
      id: { type: String, required: true },
    },

    setup: function (props) {
      var playlistStore = usePlaylistStore()
      var playerStore = usePlayerStore()

      /** Playlist details, null while loading. */
      var playlist = ref(null)

      /** Tracks currently rendered by the infinite loader. */
      var visibleTracks = ref([])

      var nextIndex = ref(0)
      var chunkSize = ref(50)
      var hasMore = ref(true)
      var loadingTracks = ref(false)
      var showEditModal = ref(false)

      // Selection is index-based: the same track can appear several times in a playlist
      var selectedIndexes = ref([])
      var confirmDialog = ref(null)
      var api = inject('$api')
      var loader = useLoader()
      var router = useRouter()
      var route = useRoute()

      function appendNextChunk() {
        if (!playlist.value || !playlist.value.tracks) {
          return
        }

        var nextChunk = playlist.value.tracks.slice(nextIndex.value, nextIndex.value + chunkSize.value)

        for (var i = 0; i < nextChunk.length; i++) {
          visibleTracks.value.push(nextChunk[i])
        }

        nextIndex.value += nextChunk.length
        hasMore.value = nextIndex.value < playlist.value.tracks.length
      }

      function loadMore() {
        if (loadingTracks.value || !hasMore.value) {
          return
        }

        loadingTracks.value = true
        setTimeout(function () {
          appendNextChunk()
          loadingTracks.value = false
        }, 300)
      }

      async function playPause() {
        if (!playlist.value || !playlist.value.tracks || !playlist.value.tracks.length) {
          return
        }

        var currentTrack = playerStore.track

        if (currentTrack) {
          for (var i = 0; i < playlist.value.tracks.length; i++) {
            if (playlist.value.tracks[i].id === currentTrack.id) {
              return await playerStore.playPause()
            }
          }
        }

        return await playerStore.playNow(playlist.value.tracks)
      }

      async function playNow() {
        if (!playlist.value || !playlist.value.tracks || !playlist.value.tracks.length) {
          return
        }

        var currentTrack = playerStore.track
        var firstTrack = playlist.value.tracks[0]

        if (currentTrack && firstTrack && currentTrack.id === firstTrack.id) {
          return
        }

        return await playerStore.playNow(playlist.value.tracks)
      }

      async function shuffleNow() {
        var shuffle = playerStore.shuffleNow(playlist.value.tracks)

        nextTick(function () {
          router.push({ name: 'queue' })
        })

        await shuffle
      }

      function toggleSelect(index) {
        if (selectedIndexes.value.indexOf(index) !== -1) {
          selectedIndexes.value = selectedIndexes.value.filter(function (item) {
            return item !== index
          })
        } else {
          selectedIndexes.value = selectedIndexes.value.concat([index])
        }
      }

      // Selects every track of the playlist, including ones not loaded yet by the infinite loader
      function toggleSelectAll() {
        var total = playlist.value.tracks.length

        if (selectedIndexes.value.length >= total) {
          selectedIndexes.value = []
          return
        }

        var selection = []

        for (var i = 0; i < total; i++) {
          selection.push(i)
        }

        selectedIndexes.value = selection
      }

      async function removeTrack(index) {
        playlist.value.tracks.splice(index, 1)
        visibleTracks.value.splice(index, 1)
        playlist.value.trackCount = playlist.value.tracks.length

        // keep the selection aligned with the shifted indexes
        selectedIndexes.value = selectedIndexes.value
          .filter(function (item) {
            return item !== index
          })
          .map(function (item) {
            if (item > index) {
              return item - 1
            }

            return item
          })

        return await playlistStore.removeTrack(props.id, index)
      }

      async function removeSelected() {
        if (!confirmDialog.value || !selectedIndexes.value.length) {
          return
        }

        var count = selectedIndexes.value.length
        var plural = ''

        if (count > 1) {
          plural = 's'
        }

        var userConfirmed = await confirmDialog.value.open(
          'Remove',
          'About to remove ' + count + ' track' + plural + ' : continue?'
        )

        if (!userConfirmed) {
          return
        }

        // highest index first, so earlier removals don't shift the later ones
        var indexes = selectedIndexes.value.slice().sort(function (a, b) {
          return b - a
        })

        for (var i = 0; i < indexes.length; i++) {
          playlist.value.tracks.splice(indexes[i], 1)
          visibleTracks.value.splice(indexes[i], 1)
        }

        playlist.value.trackCount = playlist.value.tracks.length
        selectedIndexes.value = []

        await playlistStore.removeTracks(props.id, indexes)
      }

      async function fetchPlaylist(id) {
        loader.showLoading()

        try {
          var data = await api.getPlaylist(id)
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

      async function reloadPlaylist() {
        await fetchPlaylist(props.id)

        router.replace({
          name: route.name,
          params: Object.assign({}, route.params),
          query: Object.assign({}, route.query, { t: Date.now().toString() }),
        })
      }

      async function deletePlaylist() {
        if (!confirmDialog.value) {
          return
        }

        var userConfirmed = await confirmDialog.value.open(
          'Remove',
          'About to remove playlist : continue?'
        )

        if (!userConfirmed) {
          return
        }

        await playlistStore.delete(props.id)
        router.replace({ name: 'playlists' })
      }

      function openEditModal() {
        showEditModal.value = true
      }

      async function applyPlaylistUpdate(updated) {
        playlist.value = Object.assign({}, playlist.value, updated)
        await playlistStore.update(playlist.value)
      }

      watch(
        function () {
          return props.id
        },
        async function (value) {
          await fetchPlaylist(value)
        },
        { immediate: true }
      )

      return {
        playlistStore: playlistStore,
        playerStore: playerStore,
        formatDuration: formatDuration,
        playlist: playlist,
        visibleTracks: visibleTracks,
        nextIndex: nextIndex,
        chunkSize: chunkSize,
        hasMore: hasMore,
        loadingTracks: loadingTracks,
        showEditModal: showEditModal,
        selectedIndexes: selectedIndexes,
        confirmDialog: confirmDialog,
        appendNextChunk: appendNextChunk,
        loadMore: loadMore,
        playPause: playPause,
        playNow: playNow,
        shuffleNow: shuffleNow,
        toggleSelect: toggleSelect,
        toggleSelectAll: toggleSelectAll,
        removeTrack: removeTrack,
        removeSelected: removeSelected,
        fetchPlaylist: fetchPlaylist,
        reloadPlaylist: reloadPlaylist,
        deletePlaylist: deletePlaylist,
        openEditModal: openEditModal,
        applyPlaylistUpdate: applyPlaylistUpdate,
      }
    },
  })
</script>
