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
  import { useRouter } from 'vue-router'

  export default defineComponent({
    setup() {
      const router = useRouter()
      const query = ref('')
      let clearTimeoutId: number | null = null

      const search = () => {
        const trimmed = query.value.trim()
        if (trimmed === '') {
          reloadUnfiltered()
        } else {
          router.push({ name: 'search', query: { query: trimmed } })
        }
      }

      const reloadUnfiltered = () => {
        router.back()
      }

      watch(query, (newVal, oldVal) => {
        if (oldVal && newVal.trim() === '') {
          if (clearTimeoutId) clearTimeout(clearTimeoutId)
          clearTimeoutId = window.setTimeout(() => {
            reloadUnfiltered()
          }, 300)
        }
      })

      return { query, search }
    },
  })
</script>
