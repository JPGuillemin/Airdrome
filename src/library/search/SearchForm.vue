<template>
  <form @submit.prevent="search">
    <input
      v-model="query"
      class="form-control"
      type="search"
      placeholder="Search"
    >
  </form>
</template>

<script lang="ts">
  import { defineComponent, ref, watch } from 'vue'
  import { useRouter, useRoute } from 'vue-router'

  export default defineComponent({
    setup() {
      const router = useRouter()
      const route = useRoute()

      const query = ref('')
      let clearTimeoutId: number | null = null

      const search = () => {
        const trimmed = query.value.trim()

        if (!trimmed) {
          clearSearch()
          return
        }

        router.push({
          name: 'search',
          query: { query: trimmed },
        })
      }

      const clearSearch = () => {
        // Only act if we are currently on the search route
        if (route.name === 'search') {
          router.replace({ name: 'home' }) // or whatever your base route is
        }
      }

      watch(query, (newVal, oldVal) => {
        if (oldVal && !newVal.trim()) {
          if (clearTimeoutId) clearTimeout(clearTimeoutId)
          clearTimeoutId = window.setTimeout(clearSearch, 300)
        }
      })

      return { query, search }
    },
  })
</script>
