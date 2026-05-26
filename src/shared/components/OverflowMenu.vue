// OverflowMenu.vue
<template>
  <div ref="triggerRef" class="overflow-menu-wrap" @click.stop="toggle">
    <button
      class="btn p-0"
      :class="`btn-${variant}`"
      :disabled="disabled"
      type="button"
    >
      <Icon icon="three-dots-vertical" />
    </button>

    <Teleport to="body">
      <!-- backdrop: closes menu on outside click -->
      <div v-if="isOpen" class="overflow-menu-backdrop" @click.stop="close" />

      <!-- menu: fixed-positioned, always above everything -->
      <ul
        v-if="isOpen"
        ref="menuRef"
        class="dropdown-menu show overflow-menu-list"
        :style="menuStyle"
        @click.stop="close"
      >
        <slot />
      </ul>
    </Teleport>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref, nextTick, onBeforeUnmount } from 'vue'

  export default defineComponent({
    props: {
      disabled:  { type: Boolean, default: false },
      variant:   { type: String,  default: 'link' },
      direction: { type: String,  default: 'up'   },
    },

    setup(props) {
      const isOpen     = ref(false)
      const triggerRef = ref<HTMLElement | null>(null)
      const menuRef    = ref<HTMLElement | null>(null)
      const menuStyle  = ref<Record<string, string>>({})

      const positionMenu = () => {
        if (!triggerRef.value || !menuRef.value) return
        const trigger  = triggerRef.value.getBoundingClientRect()
        const menuH    = menuRef.value.offsetHeight || 160
        const menuW    = menuRef.value.offsetWidth  || 160
        const vw       = window.innerWidth
        const vh       = window.innerHeight

        // Prefer direction prop; flip if no room
        let top: number
        if (props.direction === 'up' && trigger.top - menuH - 4 >= 0) {
          top = trigger.top - menuH - 4
        } else if (trigger.bottom + menuH + 4 <= vh) {
          top = trigger.bottom + 4
        } else {
          top = Math.max(4, trigger.top - menuH - 4)
        }

        // Align to right edge of trigger; clamp to viewport
        let left = trigger.right - menuW
        if (left < 4)        left = 4
        if (left + menuW > vw - 4) left = vw - menuW - 4

        menuStyle.value = {
          position: 'fixed',
          top:      `${top}px`,
          left:     `${left}px`,
          zIndex:   '2000',
          minWidth: '10rem',
        }
      }

      const toggle = () => {
        if (props.disabled) return
        isOpen.value = !isOpen.value
        if (isOpen.value) nextTick(positionMenu)
      }

      const close = () => { isOpen.value = false }

      // Close on Escape
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
      document.addEventListener('keydown', onKey)
      onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

      return { isOpen, triggerRef, menuRef, menuStyle, toggle, close }
    },
  })
</script>

<style scoped>
  .overflow-menu-wrap {
    display: inline-block;
  }
</style>

<style>
  /* Backdrop: transparent, sits under the menu, above everything else */
  .overflow-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1999;
  }

  /* Menu: always on top — z-index set inline too, this is belt-and-suspenders */
  .overflow-menu-list {
    z-index: 2000 !important;
  }
</style>
