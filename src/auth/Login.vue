// Login.vue
<template>
  <div class="d-flex align-items-center h-100 mt-5">
    <div v-if="!displayForm" class="mx-auto">
      <span class="spinner-border " />
    </div>
    <div v-else class="mx-auto card" style="width: 22rem">
      <div class="card-body">
        <fieldset :disabled="busy">
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
            <button class="btn btn-primary w-100" title="Log in" :disabled="busy">
              <span v-show="busy" class="spinner-border spinner-border-sm" /> Log in
            </button>
          </form>
        </fieldset>
      </div>
    </div>
  </div>
</template>

<script>
  import { defineComponent, ref, computed, onMounted } from 'vue'
  import { useMainStore } from '@/shared/store'
  import { config, useAuth } from '@/auth/service'
  import { useRouter } from 'vue-router'

  export default defineComponent({
    name: 'Login',
    props: {
      /** Route to navigate to after a successful login. */
      returnTo: { type: String, default: '/discover' }
    },
    setup: function (props) {
      var store = useMainStore()
      var auth = useAuth()
      var router = useRouter()

      var server = ref(auth.server || '')
      var username = ref(auth.username || '')
      var password = ref('')
      var busy = ref(false)
      var error = ref(null)
      var displayForm = ref(false)

      var hasError = computed(function () {
        return error.value !== null
      })

      onMounted(async function () {
        var success = await auth.autoLogin()

        if (success) {
          store.setLoginSuccess(auth.username, auth.server)
          await router.replace(props.returnTo)
        } else {
          displayForm.value = true
        }
      })

      /**
       * Attempt to log in, falling back from HTTPS to HTTP when the scheme
       * was added automatically.
       *
       * @returns {Promise<void>}
       */
      async function login() {
        error.value = null
        busy.value = true

        var originalServer = server.value.trim()
        var serverValue = originalServer

        // Don't force HTTPS - respect what user enters
        if (serverValue.indexOf('http://') !== 0 && serverValue.indexOf('https://') !== 0) {
          // Try HTTPS first, but we'll fallback to HTTP if it fails
          serverValue = 'https://' + serverValue
        }

        try {
          await auth.loginWithPassword(serverValue, username.value, password.value)
          store.setLoginSuccess(username.value, serverValue)
          await router.replace(props.returnTo)
        } catch (err) {
          // If HTTPS failed and we auto-added it, try HTTP
          if (serverValue.indexOf('https://') === 0 &&
            originalServer.indexOf('https://') !== 0) {
            var httpUrl = serverValue.replace('https://', 'http://')

            try {
              await auth.loginWithPassword(httpUrl, username.value, password.value)
              store.setLoginSuccess(username.value, httpUrl)
              await router.replace(props.returnTo)
              return
            } catch (httpErr) {
              error.value = httpErr
            }
          } else {
            error.value = err
          }
        } finally {
          busy.value = false
        }
      }

      return {
        server: server,
        username: username,
        password: password,
        busy: busy,
        error: error,
        displayForm: displayForm,
        hasError: hasError,
        config: config,
        login: login,
      }
    }
  })
</script>
