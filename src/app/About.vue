<template>
  <div>
    <div v-if="visible" class="modal-overlay" @click="$emit('close')" />
    <div v-if="visible" class="modal-dialog p-3">
      <div class="d-flex justify-content-center mb-3">
        <img width="100" height="100" src="@/shared/assets/logo.svg">
      </div>
      <div class="text-center">
        <ExternalLink :href="url">
          GitHub <Icon icon="link" />
        </ExternalLink>
        <p>Licensed under the AGPLv3 license.</p>
        <div>Build: {{ build }}</div>
        <div>Build date: {{ buildDate }}</div>

        <div class="mt-4">
          <div>Server name: {{ auth.serverInfo?.name }}</div>
          <div>Server version: {{ auth.serverInfo?.version }}</div>
          <div>
            Server URL:
            <ExternalLink :href="auth.server">
              {{ auth.server }}
            </ExternalLink>
          </div>
          <div>OpenSubsonic: {{ auth.serverInfo?.openSubsonic ?? false }}</div>
          <div v-if="auth.serverInfo?.openSubsonic">
            OpenSubsonic extensions: {{ auth.serverInfo?.extensions?.join(', ') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { useAuth } from '@/auth/service'

  export default defineComponent({
    props: {
      visible: { type: Boolean, required: true },
    },
    emits: ['close'],
    setup() {
      const auth = useAuth()
      const url = 'https://github.com/JPGuillemin/Airdrome'
      const build = __BUILD_VERSION__
      const buildDate = __BUILD_DATE__

      return {
        auth,
        build,
        buildDate,
        url,
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
</style>
