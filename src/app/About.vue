<template>
  <b-modal size="lg" hide-header hide-footer :visible="visible" @change="$emit('close')">
    <div class="d-flex justify-content-center mb-3">
      <img width="100" height="100" src="@/shared/assets/logo.svg">
    </div>
    <div class="text-center">
      <ExternalLink :href="url">
        GitHub <Icon icon="link" />
      </ExternalLink>
      <p>
        Licensed under the AGPLv3 license.
      </p>
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
          OpenSubsonic extensions: {{ auth.serverInfo?.extensions?.join(", ") }}
        </div>
      </div>
    </div>
    <div class="d-flex justify-content-end">
      <button class="btn btn-secondary" @click="$emit('close')">
        Close
      </button>
    </div>
  </b-modal>
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
        url
      }
    },
  })
</script>
