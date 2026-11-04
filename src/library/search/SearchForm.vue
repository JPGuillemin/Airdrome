// SearchForm.vue
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

<script>
  import { defineComponent, ref, watch } from 'vue'
  import { useRouter, useRoute } from 'vue-router'

  export default defineComponent({
    setup: function () {
      var router = useRouter()
      var route = useRoute()

      /** Current search input. */
      var query = ref('')
      var clearTimeoutId = null

      async function search() {
        var trimmed = query.value.trim()

        if (!trimmed) {
          await clearSearch()
          return
        }

        await router.push({
          name: 'search',
          query: { query: trimmed },
        })
      }

      async function clearSearch() {
        // Only act if we are currently on the search route
        if (route.name === 'search') {
          await router.replace({ name: 'discover' }) // or whatever your base route is
        }
      }

      watch(query, function (newVal, oldVal) {
        if (oldVal && !newVal.trim()) {
          if (clearTimeoutId) {
            clearTimeout(clearTimeoutId)
          }

          clearTimeoutId = window.setTimeout(clearSearch, 300)
        }
      })

      return {
        query: query,
        search: search,
      }
    },
  })
</script>
