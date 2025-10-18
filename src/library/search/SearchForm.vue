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
  import { defineComponent, watch } from 'vue'

  export default defineComponent({
    data() {
      return {
        query: ''
      }
    },
    watch: {
      query(newVal: string, oldVal: string) {
        // Automatically reload main content when the input is cleared
        if (oldVal && newVal.trim() === '') {
          this.reloadUnfiltered()
        }
      }
    },
    methods: {
      search(): void {
        const trimmed = this.query.trim()
        if (trimmed === '') {
          this.reloadUnfiltered()
        } else {
          this.$router.push({ name: 'search', query: { query: trimmed } })
        }
      },
      reloadUnfiltered(): void {
        this.$router.push({ name: 'home', query: { t: Date.now().toString() } })
      }
    }
  })
</script>
