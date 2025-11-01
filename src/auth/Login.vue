<template>
  <div class="d-flex align-items-center h-100 mt-5">
    <div v-if="!displayForm" class="mx-auto">
      <span class="spinner-border " />
    </div>
    <div v-else class="mx-auto card" style="width: 22rem">
      <fieldset :disabled="busy">
        <div class="card-body">
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
  import { defineComponent } from 'vue'
  import { config } from '@/shared/config'
  import { useMainStore } from '@/shared/store'
  import { useAuth } from '@/auth/service'

  export default defineComponent({
    name: 'Login',
    props: {
      returnTo: {
        type: String,
        default: '/home'
      },
    },
    setup() {
      const store = useMainStore()
      const auth = useAuth()

      return { store, auth }
    },
    data() {
      return {
        server: '',
        username: '',
        password: '',
        busy: false,
        error: null as null | Error,
        displayForm: false,
      }
    },
    computed: {
      hasError(): boolean {
        return this.error !== null
      },
      config: () => config
    },
    async mounted() {
      // Load saved credentials if any
      this.server = this.auth.server
      this.username = this.auth.username

      const success = await this.auth.autoLogin()
      if (success) {
        this.store.setLoginSuccess(this.username, this.server)
        await this.$router.replace(this.returnTo)
      } else {
        this.displayForm = true
      }
    },
    methods: {
      async login() {
        this.error = null
        this.busy = true

        this.server = this.server.trim()
        if (!this.server.startsWith('http://') && !this.server.startsWith('https://')) {
          this.server = `https://${this.server}`
        }

        try {
          await this.auth.loginWithPassword(this.server, this.username, this.password)
          this.store.setLoginSuccess(this.username, this.server)
          await this.$router.replace(this.returnTo)
        } catch (err: any) {
          this.error = err
        } finally {
          this.busy = false
        }
      }
    }
  })
</script>
