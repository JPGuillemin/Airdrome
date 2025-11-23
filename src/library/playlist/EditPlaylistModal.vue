<template>
  <div>
    <div class="modal-overlay" @click="close" />
    <div class="modal-dialog p-3">
      <div class="modal-content">
        <div class="modal-header mb-3">
          <h5 class="modal-title">
            {{ mode === 'edit' ? 'Edit Playlist' : 'New Playlist' }}
          </h5>
        </div>

        <div>
          <div class="mb-3">
            <label class="form-label">Name</label>
            <input v-model="local.name" type="text" class="form-control">
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
          <b-button variant="primary" @click="save">
            {{ mode === 'edit' ? 'Save' : 'Create' }}
          </b-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import SwitchInput from '@/shared/components/SwitchInput.vue'
  import { BButton } from 'bootstrap-vue-3'
  import type { Playlist } from '@/shared/api'
  import type { PropType } from 'vue'

  export default defineComponent({
    components: { SwitchInput, BButton },

    props: {
      playlist: { type: Object as PropType<Playlist | null>, default: null },
      mode: { type: String as PropType<'create' | 'edit'>, default: 'edit' }
    },

    emits: ['close', 'update-playlist', 'create-playlist'],

    data() {
      return {
        // in create mode: start empty
        // in edit mode: clone the existing object
        local: this.playlist
          ? { ...this.playlist }
          : { name: '', comment: '', isPublic: false }
      }
    },

    watch: {
      playlist: {
        immediate: true,
        handler(newVal) {
          // Update local copy when parent switches playlist (edit another one)
          this.local = newVal
            ? { ...newVal }
            : { name: '', comment: '', isPublic: false }
        }
      }
    },

    methods: {
      save() {
        if (!this.local.name?.trim()) {
          alert('Name cannot be empty')
          return
        }

        if (this.mode === 'edit') {
          this.$emit('update-playlist', { ...this.local })
        } else {
          this.$emit('create-playlist', this.local.name)
        }

        this.close()
      },

      close() {
        this.$emit('close')
      }
    }
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
    border-radius: 6px;
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

  .btn-close {
    background: none;
    border: none;
    font-size: 1.2rem;
  }
</style>
