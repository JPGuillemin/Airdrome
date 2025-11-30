<template>
  <transition name="fade">
    <div v-if="visible">
      <div class="modal-overlay" @click="cancel" />
      <div class="modal-dialog p-3">
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
  </transition>
</template>

<script lang="ts">
  import { defineComponent, ref } from 'vue'

  export default defineComponent({
    name: 'ConfirmDialog',
    setup() {
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
        if (resolver) resolver(result)
      }

      return {
        visible,
        title,
        message,
        open,
        confirm: () => close(true),
        cancel: () => close(false),
      }
    }
  })
</script>

<style scoped>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 1000;
  }

  .modal-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--theme-elevation-1, #fff);
    border-radius: 12px;
    max-width: 90vw;
    width: auto;
    padding: 1.5rem;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    border: 1px solid var(--theme-elevation-2, #ddd);
    z-index: 9999;
  }

  /* Transition fade */
  .fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.15s ease;
  }
  .fade-enter-from,
  .fade-leave-to {
    opacity: 0;
  }
</style>
