// PlaylistLibrary.vue
<template>
  <div class="main-content">
    <ConfirmDialog ref="confirmDialog" />
    <div class="d-flex justify-content-between align-items-center my-3">
      <div class="d-inline-flex align-items-center">
        <Icon icon="playlist" class="title-color me-2" />
        <span class="main-title">
          Playlists
        </span>
      </div>
      <ul class="nav adapt-text">
        <li>
          <router-link :to="defaultRoute">
            <Icon icon="recent" />
          </router-link>
        </li>
        <li>
          <router-link :to="azRoute">
            A-z
          </router-link>
        </li>
        <li>
          <button class="btn btn-link mx-2" @click="startCreate">
            <Icon icon="plus" />
          </button>
        </li>
      </ul>
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
    <Teleport to="body">
      <EditPlaylistModal
        v-if="showAddModal"
        :playlist="editingPlaylist"
        :mode="modalMode"
        @create-playlist="createPlaylist"
        @update-playlist="updatePlaylist"
        @close="closeModal"
      />
    </Teleport>
  </div>
</template>

<script>
  import { computed, defineComponent, ref } from 'vue'
  import PlaylistList from '@/library/playlist/PlaylistList.vue'
  import EditPlaylistModal from '@/library/playlist/EditPlaylistModal.vue'
  import { orderBy } from 'lodash-es'
  import { usePlaylistStore } from '@/library/playlist/store'
  import Icon from '@/shared/components/Icon.vue'
  import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
  import { useRoute } from 'vue-router'

  export default defineComponent({
    components: {
      PlaylistList: PlaylistList,
      Icon: Icon,
      EditPlaylistModal: EditPlaylistModal,
      ConfirmDialog: ConfirmDialog,
    },

    props: {
      /** Current sort mode ('default' or 'a-z'). */
      sort: { type: String, default: null },
    },

    setup: function (props) {
      var store = usePlaylistStore()
      var route = useRoute()

      var showAddModal = ref(false)

      /** Playlist currently being edited, null when creating a new one. */
      var editingPlaylist = ref(null)

      var confirmDialog = ref(null)

      var items = computed(function () {
        if (props.sort === 'a-z') {
          return orderBy(store.playlists, 'name')
        }

        return orderBy(store.playlists, 'createdAt', 'desc')
      })

      var loading = computed(function () {
        return store.playlists === null
      })

      var modalMode = computed(function () {
        if (editingPlaylist.value) {
          return 'edit'
        }

        return 'create'
      })

      // Route objects used by the sort links in the header.
      var defaultRoute = computed(function () {
        return Object.assign({}, route, {
          params: Object.assign({}, route.params, { sort: 'default' }),
        })
      })

      var azRoute = computed(function () {
        return Object.assign({}, route, {
          params: Object.assign({}, route.params, { sort: 'a-z' }),
        })
      })

      // ---- OPEN MODALS ----
      function startCreate() {
        editingPlaylist.value = null
        showAddModal.value = true
      }

      function openEditPlaylist(playlist) {
        editingPlaylist.value = playlist
        showAddModal.value = true
      }

      // ---- ACTION HANDLERS ----
      async function createPlaylist(name) {
        var creation = store.create(name)
        closeModal()
        await creation
      }

      async function updatePlaylist(playlist) {
        var update = store.update(playlist)
        closeModal()
        await update
      }

      async function deletePlaylist(id) {
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

        await store.delete(id)
      }

      // ---- CLOSE ----
      function closeModal() {
        editingPlaylist.value = null
        showAddModal.value = false
      }

      return {
        items: items,
        startCreate: startCreate,
        openEditPlaylist: openEditPlaylist,
        deletePlaylist: deletePlaylist,
        createPlaylist: createPlaylist,
        updatePlaylist: updatePlaylist,
        showAddModal: showAddModal,
        editingPlaylist: editingPlaylist,
        closeModal: closeModal,
        confirmDialog: confirmDialog,
        defaultRoute: defaultRoute,
        azRoute: azRoute,
        loading: loading,
        modalMode: modalMode,
      }
    },
  })
</script>
