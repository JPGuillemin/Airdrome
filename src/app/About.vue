// About.vue
<template>
  <div>
    <div v-if="visible" class="about-dialog-overlay" @click="$emit('close')" />
    <div v-if="visible" class="about-dialog p-3">
      <div class="about-dialog-content">
        <div class="d-flex justify-content-center mb-3">
          <img width="100" height="100" src="@/shared/assets/logo.svg">
        </div>
        <p class="text-center">AIRDROME {{ appVersion }}</p>
        <div class="text-center can-select">
          <ExternalLink :href="url">
            {{ url }}
          </ExternalLink>
          <p>Licensed under the AGPLv3 license.</p>
          <div>Build: {{ build }}</div>
          <div>Build date: {{ buildDate }}</div>

          <div class="mt-4">
            <div>Server name: {{ auth.serverInfo && auth.serverInfo.name }}</div>
            <div>Server version: {{ auth.serverInfo && auth.serverInfo.version }}</div>
            <div>
              Server URL:
              <ExternalLink :href="auth.server">
                {{ auth.server }}
              </ExternalLink>
            </div>
            <div>
              OpenSubsonic:
              <template v-if="auth.serverInfo && auth.serverInfo.openSubsonic">true</template>
              <template v-else>false</template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { defineComponent } from 'vue'
  import { useAuth } from '@/auth/service'

  export default defineComponent({
    props: {
      /**
       * Whether the About dialog is currently shown.
       */
      visible: { type: Boolean, required: true },
    },
    setup: function () {
      var auth = useAuth()
      var url = 'https://github.com/JPGuillemin/Airdrome'
      var build = __BUILD_VERSION__
      var buildDate = __BUILD_DATE__
      var appVersion = __APP_VERSION__

      return {
        auth: auth,
        build: build,
        buildDate: buildDate,
        appVersion: appVersion,
        url: url,
      }
    },
  })
</script>

<style scoped>
  .about-dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    z-index: 1000;
  }

 .about-dialog-content {
    background: transparent;
    border-radius: 12px;
  }

  .about-dialog {
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

  .about-dialog-footer {
    justify-content: center;
  }
</style>
