<template>
  <transition name="fade">
    <div v-if="visible" class="confirm-overlay">
      <div class="confirm-dialog card shadow-lg border-0">
        <div class="card-body text-center">
          <h5 class="fw-bold mb-3">
            {{ title }}
          </h5>
          <p class="text-secondary mb-4">
            {{ message }}
          </p>
          <div class="d-flex justify-content-center gap-2">
            <button class="btn btn-outline-secondary px-4" @click="cancel">
              Cancel
            </button>
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
  .confirm-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, 0.5); /* Dim background */
    backdrop-filter: blur(2px);
    z-index: 2000;
  }

  /* Dialog box */
  .confirm-dialog {
    background-color: var(--bs-body-bg, #fff);
    color: var(--bs-body-color, #000);
    border-radius: 1rem;
    max-width: 400px;
    width: 90%;
    transition: all 0.2s ease;
  }

  /* Dark mode adaptation */
  @media (prefers-color-scheme: dark) {
    .confirm-dialog {
      background-color: #1e1e1e;
      color: #f1f1f1;
    }
  }

  /* Fade animation */
  .fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.2s ease;
  }
  .fade-enter-from,
  .fade-leave-to {
    opacity: 0;
  }
</style>
