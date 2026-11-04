// OverflowFade.vue
<template>
  <div ref="el" class="el" @scroll="updateScrollPosition">
    <slot />
  </div>
</template>
<script>
  import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue'

  export default defineComponent({
    setup: function () {
      var el = ref(null)
      var isScrolledToTop = ref(true)
      var isScrolledToBottom = ref(true)

      function updateScrollPosition() {
        isScrolledToBottom.value = el.value.scrollHeight - el.value.scrollTop - el.value.clientHeight < 1
        isScrolledToTop.value = el.value.scrollTop < 1
      }

      var maskTop = computed(function () {
        if (isScrolledToTop.value) {
          return '0'
        }

        return '2em'
      })

      var maskBottom = computed(function () {
        if (isScrolledToBottom.value) {
          return '0'
        }

        return '2em'
      })

      var resizeObserver = new ResizeObserver(function () {
        updateScrollPosition()
      })

      onMounted(function () {
        resizeObserver.observe(el.value)
      })

      onUnmounted(function () {
        resizeObserver.disconnect()
      })

      return {
        el: el,
        updateScrollPosition: updateScrollPosition,
        maskTop: maskTop,
        maskBottom: maskBottom,
      }
    },
  })
</script>
<style scoped>
  .el {
    mask-image:
      linear-gradient(to bottom, transparent 0, black v-bind(maskTop)),
      linear-gradient(to top, transparent 0, black v-bind(maskBottom));
    mask-composite: intersect;
    overflow-y: scroll;
    scrollbar-width: none;
    min-height: 0;
    max-height: 7rem;
  }
  .el::-webkit-scrollbar {
    display: none;
  }
</style>
