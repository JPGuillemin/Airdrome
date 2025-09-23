<template>
  <div>
    <slot :items="items" />
    <InfiniteLoader :loading="loading" :has-more="hasMore" @load-more="loadMore" />
  </div>
</template>
  <script lang="ts">
  import { defineComponent, PropType } from 'vue'
  import { useLoader } from '@/shared/loader'

  export default defineComponent({
    props: {
      load: { type: Function as PropType<(offset: number) => Promise<any[]>>, required: true },
    },
    data() {
      return {
        items: [] as any[],
        loading: false,
        offset: 0 as number,
        hasMore: true,
      }
    },
    methods: {
      loadMore() {
        const loader = useLoader()
        loader.showLoading()
        this.loading = true
        return this.load(this.offset).then((items: any[]) => {
          this.items.push(...items)
          this.offset += items.length
          this.hasMore = items.length > 0
          this.loading = false
          loader.hideLoading()
        })
      }
    }
  })
</script>
