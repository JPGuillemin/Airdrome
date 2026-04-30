<template>
  <div ref="el">
    <slot />
    <ul
      v-if="enabled && visible"
      :class="['dropdown-menu', 'position-absolute', 'show']"
      :style="{ left: `${position.left}px`,top: `${position.top}px` }"
    >
      <slot name="context-menu" />
    </ul>
  </div>
</template>
<script lang="ts">
  import { defineComponent, ref, inject } from 'vue'
  import { useEventListener } from '@vueuse/core'

  export default defineComponent({
    props: {
      enabled: { type: Boolean, default: true },
    },

    setup(props) {
      const isNative = inject<boolean>('isNative', false)

      const el = ref<HTMLElement | null>(null)
      const visible = ref(false)

      const position = ref({
        top: 0,
        left: 0,
      })

      let timer: ReturnType<typeof setTimeout> | null = null
      let startX = 0
      let startY = 0

      const closeMenu = () => {
        visible.value = false
      }

      const openMenu = (x: number, y: number) => {
        const menuWidth = 180
        const menuHeight = 220
        const margin = 8

        const rect = el.value?.getBoundingClientRect()

        let left = x
        let top = y

        if (rect) {
          left = x - rect.left
          top = y - rect.top
        }

        if (left + menuWidth > window.innerWidth - margin) {
          left = window.innerWidth - menuWidth - margin
        }

        if (top + menuHeight > window.innerHeight - margin) {
          top = window.innerHeight - menuHeight - margin
        }

        if (left < margin) left = margin
        if (top < margin) top = margin

        position.value = { left, top }
        visible.value = true

        if (isNative && navigator.vibrate) {
          navigator.vibrate(20)
        }
      }

      const cancelPress = () => {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
      }

      const startPress = (event: PointerEvent) => {
        if (!props.enabled) return
        if (!isNative) return
        if (!el.value) return
        if (!el.value.contains(event.target as Node)) return

        closeMenu()

        startX = event.clientX
        startY = event.clientY

        timer = setTimeout(() => {
          openMenu(startX, startY)
          timer = null
        }, 520)
      }

      const movePress = (event: PointerEvent) => {
        if (!timer) return

        const dx = Math.abs(event.clientX - startX)
        const dy = Math.abs(event.clientY - startY)

        if (dx > 8 || dy > 8) {
          cancelPress()
        }
      }

      // MOBILE / CAPACITOR LONG PRESS
      useEventListener(document, 'pointerdown', startPress)
      useEventListener(document, 'pointerup', cancelPress)
      useEventListener(document, 'pointercancel', cancelPress)
      useEventListener(document, 'pointermove', movePress)

      // DESKTOP RIGHT CLICK
      useEventListener(document, 'contextmenu', (event) => {
        if (!props.enabled) return
        if (isNative) return
        if (!el.value) return
        if (!el.value.contains(event.target as Node)) {
          closeMenu()
          return
        }

        event.preventDefault()
        openMenu(event.clientX, event.clientY)
      })

      // CLOSES
      useEventListener(document, 'click', closeMenu)

      useEventListener(document, 'scroll', closeMenu, { passive: true })

      useEventListener(document, 'keyup', (event) => {
        if (event.key === 'Escape') closeMenu()
      })

      return {
        el,
        visible,
        position,
      }
    },
  })
</script>
<style>
  .dropdown-menu {
    min-width: 3rem !important;
    z-index: 3000 !important;
    position: absolute !important;
  }
  .dropdown-menu .dropdown-item {
    z-index: 9000 !important;
  }
</style>
