<template>
  <div class="main-content">
    <h1 class="poster-title">
      Playlists
    </h1>

    <div class="d-flex justify-content-between align-items-center mb-3">
      <ul class="nav-underlined">
        <li>
          <router-link :to="{ ...$route, params: { ...$route.params, sort: null } }">
            Recently added
          </router-link>
        </li>
        <li>
          <router-link :to="{ ...$route, params: { ...$route.params, sort: 'a-z' } }">
            A-Z
          </router-link>
        </li>
      </ul>
      <b-button variant="link" @click="showAddModal = true">
        <Icon icon="plus" />
      </b-button>
    </div>

    <PlaylistList
      v-if="items.length > 0"
      :items="items"
      :allow-h-scroll="false"
      :is-playlist-view="true"
      @edit-playlist="openEditPlaylist"
      @remove-playlist="deletePlaylist"
    />
    <EmptyIndicator v-else />

    <!-- Modal embedded directly -->
    <div v-if="showAddModal" class="modal-overlay" />
    <div v-if="showAddModal" class="modal-dialog p-3">
      <div class="modal-content">
        <div class="modal-header mb-3">
          <h5 class="modal-title">
            {{ editingPlaylist ? 'Edit Playlist' : 'New Playlist' }}
          </h5>
          <button class="btn-close" @click="closeModal" />
        </div>
        <div>
          <div class="mb-3">
            <label class="form-label">Name</label>
            <input v-model="newPlaylistName" class="form-control" placeholder="Enter playlist name">
          </div>
        </div>
        <div class="modal-footer mb-3">
          <b-button variant="secondary" class="mx-2" @click="closeModal">
            Cancel
          </b-button>
          <b-button variant="primary" class="mx-2" @click="createPlaylist">
            {{ editingPlaylist ? 'Save' : 'Create' }}
          </b-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
  import { computed, defineComponent, ref } from 'vue'
  import PlaylistList from '@/library/playlist/PlaylistList.vue'
  import { orderBy } from 'lodash-es'
  import { usePlaylistStore } from '@/library/playlist/store'
  import Icon from '@/shared/components/Icon.vue'
  import { BButton } from 'bootstrap-vue-3'
  import type { Playlist } from '@/shared/api'

  export default defineComponent({
    components: {
      PlaylistList,
      Icon,
      BButton,
    },
    props: {
      sort: { type: String, default: null },
    },
    setup(props) {
      const store = usePlaylistStore()

      const showAddModal = ref(false)
      const newPlaylistName = ref('')
      const editingPlaylist = ref<Playlist | null>(null)

      const items = computed(() =>
        props.sort === 'a-z'
          ? orderBy(store.playlists, 'name')
          : orderBy(store.playlists, 'createdAt', 'desc')
      )

      const openEditPlaylist = (playlist: Playlist) => {
        editingPlaylist.value = playlist
        newPlaylistName.value = playlist.name
        showAddModal.value = true
      }

      const deletePlaylist = (id: string) => {
        store.delete(id)
      }

      const closeModal = () => {
        newPlaylistName.value = ''
        editingPlaylist.value = null
        showAddModal.value = false
      }

      const createPlaylist = () => {
        if (!newPlaylistName.value.trim()) {
          alert('Please enter a playlist name')
          return
        }

        if (editingPlaylist.value) {
          store.update({
            ...editingPlaylist.value,
            name: newPlaylistName.value,
          })
        } else {
          store.create(newPlaylistName.value)
        }

        closeModal()
      }

      return {
        showAddModal,
        newPlaylistName,
        items,
        editingPlaylist,
        openEditPlaylist,
        deletePlaylist,
        closeModal,
        createPlaylist,
        loading: computed(() => store.playlists === null),
      }
    },
  })
</script>

<style scoped>
  .poster-title {
    margin-top: 10px;
    font-size: 1.5rem;
  }

  /* Modal overlay (semi-transparent background) */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0,0,0,0.5);
    z-index: 1000;
  }

  .modal-dialog {
    position: fixed; /* fix it relative to viewport */
    top: 50%;         /* vertical center */
    left: 50%;        /* horizontal center */
    transform: translate(-50%, -50%); /* adjust for element’s size */
    background: var(--theme-elevation-1);
    border-radius: 6px;
    max-width: 600px;
    width: auto;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 9999;
    padding: 1rem;
  }

  .modal-header,
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .modal-body {
    padding: 1rem;
  }

  .btn-close {
    background: none;
    border: none;
    font-size: 1.2rem;
  }
</style>
