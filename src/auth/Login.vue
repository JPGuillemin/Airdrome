<template>
  <div class="d-flex align-items-center h-100 mt-5">
    <div v-if="!displayForm" class="mx-auto">
      <span class="spinner-border " />
    </div>
    <div v-else class="mx-auto card" style="width: 22rem">
      <fieldset :disabled="busy">
        <div>
          <form @submit.prevent="login">
            <div class="d-flex justify-content-center mb-3">
              <img width="100" height="100" src="@/shared/assets/logo.svg">
            </div>
            <div v-if="!config.serverUrl" class="mb-3">
              <label class="form-label">Server</label>
              <input v-model="server" name="server" type="text"
                     class="form-control" :class="{'is-invalid': hasError}">
            </div>
            <div class="mb-3">
              <label class="form-label">Username</label>
              <input v-model="username" name="username" type="text"
                     class="form-control" :class="{'is-invalid': hasError}">
            </div>
            <div class="mb-3">
              <label class="form-label">Password</label>
              <input v-model="password" name="password" type="password"
                     class="form-control" :class="{'is-invalid': hasError}">
            </div>
            <div v-if="error != null" class="alert alert-danger">
              Could not log in. ({{ error.message }})
            </div>
            <button class="btn btn-primary w-100" :disabled="busy">
              <span v-show="busy" class="spinner-border spinner-border-sm" /> Log in
            </button>
          </form>
        </div>
      </fieldset>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref, computed, onMounted } from 'vue'
  import { useMainStore } from '@/shared/store'
  import { config, useAuth } from '@/auth/service'
  import { useRouter } from 'vue-router'

  export default defineComponent({
    name: 'Login',
    props: {
      returnTo: { type: String, default: '/discover' }
    },
    setup(props) {
      const store = useMainStore()
      const auth = useAuth()
      const router = useRouter()

      const server = ref(auth.server || '')
      const username = ref(auth.username || '')
      const password = ref('')
      const busy = ref(false)
      const error = ref<Error | null>(null)
      const displayForm = ref(false)

      const hasError = computed(() => error.value !== null)

      onMounted(async() => {
        const success = await auth.autoLogin()
        if (success) {
          store.setLoginSuccess(auth.username, auth.server)
          await router.replace(props.returnTo)
        } else {
          displayForm.value = true
        }
      })

      const login = async() => {
        error.value = null
        busy.value = true

        let serverValue = server.value.trim()
        if (!serverValue.startsWith('http://') && !serverValue.startsWith('https://')) {
          serverValue = `https://${serverValue}`
        }

        try {
          await auth.loginWithPassword(serverValue, username.value, password.value)
          store.setLoginSuccess(username.value, serverValue)
          await router.replace(props.returnTo)
        } catch (err: any) {
          error.value = err
        } finally {
          busy.value = false
        }
      }

      return { server, username, password, busy, error, displayForm, hasError, config, login }
    }
  })
</script>
