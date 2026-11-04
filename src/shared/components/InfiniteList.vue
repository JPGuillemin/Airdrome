// InfiniteList.vue
<template>
  <div>
    <slot :items="items" />
    <InfiniteLoader :loading="loading" :has-more="hasMore" @load-more="loadMore" />
  </div>
</template>
<script>
  import { defineComponent, ref } from 'vue'

  export default defineComponent({
    props: {
      /** Loader returning the next page of items. */
      load: { type: Function, required: true },
    },
    setup: function (props) {
      var items = ref([])
      var loading = ref(false)
      var offset = ref(0)
      var hasMore = ref(true)

      async function loadMore() {
        // Guard against the loader firing twice (mount + intersection).
        if (loading.value || !hasMore.value) {
          return
        }

        loading.value = true

        try {
          var newItems = await props.load(offset.value)

          items.value.push.apply(items.value, newItems)
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

      return {
        items: items,
        loading: loading,
        offset: offset,
        hasMore: hasMore,
        loadMore: loadMore
      }
    }
  })
</script>
