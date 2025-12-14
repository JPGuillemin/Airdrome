<template>
  <div>
    <div v-if="visible" class="modal-overlay" @click="cancel" />
    <div v-if="visible" class="modal-dialog p-3">
      <div class="modal-content">
        <div class="text-center mb-3">
          <h5 class="mb-3">
            {{ title }}
          </h5>
          <p class="text-secondary mb-4">
            {{ message }}
          </p>
          <div class="d-flex justify-content-center gap-2">
            <button class="btn btn-primary px-4" @click="confirm">
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref } from 'vue'

  export interface ConfirmDialogExpose {
    open: (title: string, message: string) => Promise<boolean>
  }

  export default defineComponent({
    setup(_, { expose }) {
      const visible = ref(false)
      const title = ref('')
      const message = ref('')
      let resolver: ((value: boolean) => void) | null = null

      function open(t: string, m: string) {
        title.value = t
        message.value = m
        visible.value = true
        return new Promise<boolean>((resolve) => {
          resolver = resolve
        })
      }

      function close(result: boolean) {
        visible.value = false
        resolver?.(result)
        resolver = null
      }

      function confirm() { close(true) }
      function cancel() { close(false) }

      expose({ open })

      return {
        visible,
        title,
        message,
        confirm,
        cancel,
      }
    },
  })
</script>

<style scoped>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    z-index: 1000;
  }

  .modal-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--theme-elevation-1);
    border-radius: 12px;
    max-width: 90vw;
    width: auto;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    border: 1px solid var(--theme-elevation-2);
    z-index: 9999;
    padding: 1rem;
  }

  .modal-content {
    background: var(--theme-elevation-1);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  }

  .modal-footer {
    justify-content: center;
  }
</style>
