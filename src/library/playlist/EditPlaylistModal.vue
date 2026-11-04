<template>
  <div>
    <div class="modal-overlay" @click="close" />
    <div class="modal-dialog p-3">
      <div class="modal-content">
        <div class="modal-header mb-3">
          <h5 class="modal-title">
            {{ title }}
          </h5>
        </div>

        <div>
          <!-- Add mode: pick an existing playlist or create a new one -->
          <div v-if="mode === 'add'" class="mb-3">
            <label class="form-label">Playlist</label>
            <select v-model="selectedId" class="form-select">
              <option :value="NEW_PLAYLIST">
                + New playlist
              </option>
              <option v-for="p in playlists" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select>
          </div>

          <div v-if="showName" class="mb-3">
            <label class="form-label">Name</label>
            <input v-model="local.name" type="text" class="form-control" @keyup.enter="save">
          </div>

          <div v-if="mode === 'edit'" class="mb-3">
            <label class="form-label">Comment</label>
            <textarea v-model="local.comment" class="form-control" />
          </div>

          <div v-if="mode === 'edit'" class="mb-3">
            <label class="form-label">Public</label>
            <SwitchInput v-model="local.isPublic" />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-primary" @click="save">
            {{ buttonLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { computed, defineComponent, ref, watch } from 'vue'
  import { orderBy } from 'lodash-es'
  import SwitchInput from '@/shared/components/SwitchInput.vue'
  import { usePlaylistStore } from '@/library/playlist/store'

  var NEW_PLAYLIST = '__new__'

  export default defineComponent({
    components: { SwitchInput: SwitchInput },

    props: {
      // In 'add' mode, `playlist` is only used to prefill the name
      // used when creating a new playlist.
      /** Playlist being edited, or the template used to prefill a new one. */
      playlist: { type: Object, default: null },
      /** Modal mode: 'create', 'edit' or 'add'. */
      mode: { type: String, default: 'edit' },
    },

    emits: ['close', 'update-playlist', 'create-playlist', 'add-to-playlist'],

    setup: function (props, context) {
      var emit = context.emit
      var playlistStore = usePlaylistStore()

      var initialPlaylist = { name: '', comment: '', isPublic: false }

      if (props.playlist) {
        initialPlaylist = Object.assign({}, props.playlist)
      }

      /** Local editable copy of the playlist. */
      var local = ref(initialPlaylist)

      watch(
        function () {
          return props.playlist
        },
        function (newVal) {
          if (newVal) {
            local.value = Object.assign({}, newVal)
          } else {
            local.value = { name: '', comment: '', isPublic: false }
          }
        },
        { immediate: true }
      )

      var playlists = computed(function () {
        return orderBy(playlistStore.playlists || [], 'name')
      })

      // Default selection: the playlist matching the prefilled name if there
      // is one, otherwise "New playlist".
      var initialSelectedId = NEW_PLAYLIST

      if (props.mode === 'add') {
        var matchingPlaylist = playlistStore.findByName(local.value.name || '')

        if (matchingPlaylist && matchingPlaylist.id != null) {
          initialSelectedId = matchingPlaylist.id
        }
      }

      var selectedId = ref(initialSelectedId)

      var isNew = computed(function () {
        return props.mode === 'add' && selectedId.value === NEW_PLAYLIST
      })

      var showName = computed(function () {
        return props.mode !== 'add' || isNew.value
      })

      var title = computed(function () {
        if (props.mode === 'edit') {
          return 'Edit Playlist'
        }

        if (props.mode === 'add') {
          return 'Add to Playlist'
        }

        return 'New Playlist'
      })

      var buttonLabel = computed(function () {
        if (props.mode === 'edit') {
          return 'Save'
        }

        if (props.mode === 'add') {
          if (isNew.value) {
            return 'Create'
          }

          return 'Add'
        }

        return 'Create'
      })

      function close() {
        emit('close')
      }

      function save() {
        if (props.mode === 'add' && !isNew.value) {
          emit('add-to-playlist', selectedId.value)
          close()
          return
        }

        if (!local.value.name || !local.value.name.trim()) {
          alert('Name cannot be empty')
          return
        }

        if (props.mode === 'edit') {
          emit('update-playlist', Object.assign({}, local.value))
        } else {
          emit('create-playlist', local.value.name)
        }

        close()
      }

      return {
        local: local,
        playlists: playlists,
        selectedId: selectedId,
        NEW_PLAYLIST: NEW_PLAYLIST,
        showName: showName,
        title: title,
        buttonLabel: buttonLabel,
        save: save,
        close: close,
      }
    },
  })
</script>

<style scoped>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0,0,0,0.5);
    z-index: 3000;
  }

  .modal-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: var(--theme-elevation-1);
    border-radius: 12px;
    max-width: 600px;
    width: auto;
    z-index: 3001;
    border: 1px solid var(--theme-elevation-2);
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  }

  .modal-header, .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .modal-footer {
    justify-content: center;
  }
</style>
