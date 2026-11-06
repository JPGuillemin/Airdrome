// ConfirmDialog.vue
<template>
  <div>
    <div v-if="visible" class="confirm-dialog-overlay" @click="cancel" />
    <div v-if="visible" class="confirm-dialog p-3">
      <div class="confirm-dialog-content">
        <div class="text-center mb-3">
          <h5 class="mb-3">
            {{ title }}
          </h5>
          <p class="mb-4">
            {{ message }}
          </p>
          <div class="d-flex justify-content-center gap-2">
            <button class="btn btn-primary px-4" title="Confirm" @click="confirm">
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { defineComponent, ref } from 'vue'

  /**
   * @typedef {Object} ConfirmDialogExpose
   * @property {function(string, string): Promise<boolean>} open
   */

  export default defineComponent({
    setup: function (_, context) {
      var visible = ref(false)
      var title = ref('')
      var message = ref('')

      /** Pending promise resolver, or null when the dialog is closed. */
      var resolver = null

      /**
       * Open the dialog and resolve when the user answers.
       *
       * @param {string} t
       * @param {string} m
       * @returns {Promise<boolean>}
       */
      function open(t, m) {
        title.value = t
        message.value = m
        visible.value = true

        return new Promise(function (resolve) {
          resolver = resolve
        })
      }

      /**
       * Hide the dialog and resolve the pending promise.
       *
       * @param {boolean} result
       * @returns {void}
       */
      function close(result) {
        visible.value = false

        if (resolver) {
          resolver(result)
        }

        resolver = null
      }

      function confirm() {
        close(true)
      }

      function cancel() {
        close(false)
      }

      context.expose({ open: open })

      return {
        visible: visible,
        title: title,
        message: message,
        confirm: confirm,
        cancel: cancel,
      }
    },
  })
</script>

<style scoped>
  .confirm-dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    z-index: 1000;
  }

  .confirm-dialog-content {
    background: transparent;
    border-radius: 12px;
  }

  .confirm-dialog {
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

  .confirm-dialog-footer {
    justify-content: center;
  }
</style>
