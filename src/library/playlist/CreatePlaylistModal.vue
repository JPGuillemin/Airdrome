<template>
  <BModal :model-value="visible" @update:model-value="close">
    <template #modal-header>
      <h5 class="modal-title">
        New Playlist
      </h5>
    </template>

    <div class="mb-3">
      <label class="form-label">Name</label>
      <input v-model="name" class="form-control" placeholder="Enter playlist name">
    </div>

    <template #modal-footer>
      <BButton variant="secondary" @click="cancel">
        Cancel
      </BButton>
      <BButton variant="primary" @click="confirm">
        Create
      </BButton>
    </template>
  </BModal>
</template>

<script lang="ts">
  import { defineComponent, ref, PropType } from 'vue'
  import { usePlaylistStore } from '@/library/playlist/store'
  import { Track } from '@/shared/api'
  import { BModal, BButton } from 'bootstrap-vue-3'

  export default defineComponent({
    components: { BModal, BButton },
    props: {
      visible: { type: Boolean, required: true },
      tracks: { type: Array as PropType<Track[] | null>, default: null },
    },
    emits: ['update:visible'],
    setup(props, { emit }) {
      const name = ref('')
      const store = usePlaylistStore()

      const close = () => emit('update:visible', false)

      const cancel = () => {
        name.value = ''
        close()
      }

      const confirm = () => {
        if (!name.value) {
          alert('Please enter a playlist name')
          return
        }

        // Call the store to create playlist
        store.create(name.value, props.tracks?.map(t => t.id))
        close()
        name.value = ''
      }

      return { name, cancel, confirm, close }
    },
  })
</script>
