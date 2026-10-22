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

<script lang="ts">
  import { computed, defineComponent, ref, watch } from 'vue'
  import { orderBy } from 'lodash-es'
  import SwitchInput from '@/shared/components/SwitchInput.vue'
  import { usePlaylistStore } from '@/library/playlist/store'
  import type { Playlist } from '@/shared/api'
  import type { PropType } from 'vue'

  const NEW_PLAYLIST = '__new__'

  export default defineComponent({
    components: { SwitchInput },

    props: {
      // In 'add' mode, `playlist` is only used to prefill the name
      // used when creating a new playlist.
      playlist: { type: Object as PropType<Playlist | null>, default: null },
      mode: { type: String as PropType<'create' | 'edit' | 'add'>, default: 'edit' }
    },

    emits: ['close', 'update-playlist', 'create-playlist', 'add-to-playlist'],

    setup(props, { emit }) {
      const playlistStore = usePlaylistStore()

      const local = ref(
        props.playlist
          ? { ...props.playlist }
          : { name: '', comment: '', isPublic: false }
      )

      watch(
        () => props.playlist,
        (newVal) => {
          local.value = newVal
            ? { ...newVal }
            : { name: '', comment: '', isPublic: false }
        },
        { immediate: true }
      )

      const playlists = computed(() => orderBy(playlistStore.playlists || [], 'name'))

      // Default selection: the playlist matching the prefilled name if there
      // is one, otherwise "New playlist".
      const selectedId = ref<string>(
        props.mode === 'add'
          ? playlistStore.findByName(local.value.name || '')?.id ?? NEW_PLAYLIST
          : NEW_PLAYLIST
      )

      const isNew = computed(() => props.mode === 'add' && selectedId.value === NEW_PLAYLIST)
      const showName = computed(() => props.mode !== 'add' || isNew.value)

      const title = computed(() => {
        if (props.mode === 'edit') return 'Edit Playlist'
        if (props.mode === 'add') return 'Add to Playlist'
        return 'New Playlist'
      })

      const buttonLabel = computed(() => {
        if (props.mode === 'edit') return 'Save'
        if (props.mode === 'add') return isNew.value ? 'Create' : 'Add'
        return 'Create'
      })

      const close = () => {
        emit('close')
      }

      const save = () => {
        if (props.mode === 'add' && !isNew.value) {
          emit('add-to-playlist', selectedId.value)
          close()
          return
        }

        if (!local.value.name?.trim()) {
          alert('Name cannot be empty')
          return
        }

        if (props.mode === 'edit') {
          emit('update-playlist', { ...local.value })
        } else {
          emit('create-playlist', local.value.name)
        }

        close()
      }

      return {
        local,
        playlists,
        selectedId,
        NEW_PLAYLIST,
        showName,
        title,
        buttonLabel,
        save,
        close,
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
