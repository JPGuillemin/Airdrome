<template>
  <div class="mw-100">
    <small class="sidebar-heading text-muted">
      Playlists
      <button type="button" class="btn btn-link btn-sm p-0 float-end" @click="showAddModal = true">
        <Icon icon="plus" />
      </button>
      <CreatePlaylistModal :visible.sync="showAddModal" />
    </small>

    <!-- Random playlist -->
    <div class="nav-link" style="cursor: pointer;" @click="navigateToPlaylist('random')">
      <Icon icon="playlist" class="me-2" /> Random
    </div>

    <!-- User playlists -->
    <template v-if="playlists">
      <div
        v-for="item in playlists"
        :key="item.id"
        class="nav-link"
        style="cursor: pointer;"
        @click="navigateToPlaylist(item.id)"
      >
        <span @dragover="onDragover" @drop="onDrop(item.id, $event)">
          <Icon icon="playlist" class="me-2" /> {{ item.name }}
        </span>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
  import { computed, defineComponent } from 'vue'
  import { useUiStore } from '@/shared/ui'
  import CreatePlaylistModal from '@/library/playlist/CreatePlaylistModal.vue'
  import { usePlaylistStore } from '@/library/playlist/store'

  export default defineComponent({
    components: { CreatePlaylistModal },
    setup() {
      const store = usePlaylistStore()
      const playlists = computed(() => store.playlists?.slice(0, 20))
      return { playlists, addTracks: store.addTracks }
    },
    data() {
      return { showAddModal: false }
    },
    methods: {
      navigateToPlaylist(id: string) {
        const ui = useUiStore()
        ui.showLoading()
        this.$router.push({ name: 'playlist', params: { id } })
      },
      async onDrop(playlistId: string, event: any) {
        event.preventDefault()
        const trackId = event.dataTransfer.getData('application/x-track-id')
        if (trackId) return this.addTracks(playlistId, [trackId])

        const albumId = event.dataTransfer.getData('application/x-album-id')
        if (albumId) {
          const album = await this.$api.getAlbumDetails(albumId)
          return this.addTracks(playlistId, album.tracks!.map(t => t.id))
        }
      },
      onDragover(event: DragEvent) {
        if (
          event.dataTransfer?.types.includes('application/x-track-id') ||
          event.dataTransfer?.types.includes('application/x-album-id')
        ) {
          event.dataTransfer.dropEffect = 'copy'
          event.preventDefault()
        }
      },
    }
  })
</script>
