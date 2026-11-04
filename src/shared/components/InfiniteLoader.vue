// InfiniteLoader.vue
<template>
  <div ref="el" class="d-flex justify-content-center my-4">
    <span />
  </div>
</template>
<script>
  import { defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useIntersectionObserver } from '@vueuse/core'

  function isInViewport(el) {
    if (!el) {
      return false
    }

    var rect = el.getBoundingClientRect()

    return (
      rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.left <= (window.innerWidth || document.documentElement.clientWidth)
    )
  }

  export default defineComponent({
    props: {
      /** Whether a page load is currently in progress. */
      loading: { type: Boolean, required: true },
      /** Whether more items can still be loaded. */
      hasMore: { type: Boolean, required: true },
    },
    emits: ['load-more'],
    setup: function (props, context) {
      var el = ref(null)

      function check() {
        if (isInViewport(el.value) && !props.loading && props.hasMore) {
          context.emit('load-more')
        }
      }

      var observer = useIntersectionObserver(el, function () {
        check()
      })

      var stop = observer.stop

      watch(
        function () {
          return [props.loading, props.hasMore]
        },
        function () {
          check()
        }
      )

      onMounted(function () {
        context.emit('load-more')
      })

      onBeforeUnmount(function () {
        stop()
      })

      return {
        el: el
      }
    },
  })
</script>
