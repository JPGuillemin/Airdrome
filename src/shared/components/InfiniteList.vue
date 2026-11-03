// InfiniteList.vue
<template>
  <div>
    <slot :items="items" />
    <InfiniteLoader :loading="loading" :has-more="hasMore" @load-more="loadMore" />
  </div>
</template>
<script lang="ts">
  import { defineComponent, ref, PropType } from 'vue'

  export default defineComponent({
    props: {
      load: { type: Function as PropType<(offset: number) => Promise<any[]>>, required: true },
    },
    setup(props) {
      const items = ref<any[]>([])
      const loading = ref(false)
      const offset = ref(0)
      const hasMore = ref(true)

      const loadMore = async() => {
        // Guard against the loader firing twice (mount + intersection).
        if (loading.value || !hasMore.value) return
        loading.value = true
        try {
          const newItems = await props.load(offset.value)
          items.value.push(...newItems)
          offset.value += newItems.length
          hasMore.value = newItems.length > 0
        } catch (err) {
          console.error('[InfiniteList] load failed', err)
          // Stop retrying automatically; the user can navigate away/back.
          hasMore.value = false
        } finally {
          loading.value = false
        }
      }

      return { items, loading, offset, hasMore, loadMore }
    }
  })
</script>
