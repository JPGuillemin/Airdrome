<template>
  <div class="main-content">
    <div class="d-flex justify-content-between align-items-center my-3">
      <div class="d-inline-flex align-items-center">
        <Icon icon="playlist" class="title-color me-2" />
        <span class="main-title">
          Playlists
        </span>
      </div>
      <ul class="nav adapt-text">
        <li>
          <router-link :to="{ ... $route, params: {} }">
            <Icon icon="recent" />
          </router-link>
        </li>
        <li>
          <router-link :to="{ ... $route, params: { ... $route.params, sort: 'a-z' } }">
            A-z
          </router-link>
        </li>
        <li>
          <b-button variant="link" class="mx-2" @click="startCreate">
            <Icon icon="plus" />
          </b-button>
        </li>
      </ul>
    </div>

    <PlaylistList
      v-if="items.length > 0"
      :items="items"
      tile-size="120"
      :allow-h-scroll="false"
      :is-playlist-view="true"
      @edit-playlist="openEditPlaylist"
      @remove-playlist="deletePlaylist"
    />
    <EmptyIndicator v-else />
    <Teleport to="body">
      <EditPlaylistModal
        v-if="showAddModal"
        :playlist="editingPlaylist"
        :mode="editingPlaylist ? 'edit' : 'create'"
        @create-playlist="createPlaylist"
        @update-playlist="updatePlaylist"
        @close="closeModal"
      />
    </Teleport>
  </div>
</template>

<script lang="ts">
  import { computed, defineComponent, ref } from 'vue'
  import PlaylistList from '@/library/playlist/PlaylistList.vue'
  import EditPlaylistModal from '@/library/playlist/EditPlaylistModal.vue'
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
      EditPlaylistModal,
    },

    props: {
      sort: { type: String, default: null },
    },

    setup(props) {
      const store = usePlaylistStore()

      const showAddModal = ref(false)
      const editingPlaylist = ref<Playlist | null>(null)

      const items = computed(() =>
        props.sort === 'a-z'
          ? orderBy(store.playlists, 'name')
          : orderBy(store.playlists, 'createdAt', 'desc')
      )

      // ---- OPEN MODALS ----
      const startCreate = () => {
        editingPlaylist.value = null
        showAddModal.value = true
      }

      const openEditPlaylist = (playlist: Playlist) => {
        editingPlaylist.value = playlist
        showAddModal.value = true
      }

      // ---- ACTION HANDLERS ----
      const createPlaylist = (name: string) => {
        store.create(name)
        closeModal()
      }

      const updatePlaylist = (playlist: Playlist) => {
        store.update(playlist)
        closeModal()
      }

      const deletePlaylist = (id: string) => {
        const userConfirmed = window.confirm(
          'About to remove playlist...\nContinue?'
        )
        if (!userConfirmed) return
        store.delete(id)
      }

      // ---- CLOSE ----
      const closeModal = () => {
        editingPlaylist.value = null
        showAddModal.value = false
      }

      return {
        items,
        startCreate,
        openEditPlaylist,
        deletePlaylist,
        createPlaylist,
        updatePlaylist,
        showAddModal,
        editingPlaylist,
        closeModal,
        loading: computed(() => store.playlists === null),
      }
    },
  })
</script>
