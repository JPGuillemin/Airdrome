// Dropdown.vue
<template>
  <div ref="el" class="dropdown">
    <button
      type="button"
      :class="`btn btn-${variant} dropdown-toggle ${toggleClass}`"
      @click="toggle">
      <slot name="button-content" />
    </button>

    <Teleport to="body">
      <!-- backdrop: closes menu on outside click -->
      <div v-if="visible" class="dropdown-teleport-backdrop" @click.stop="close" />

      <!-- menu: fixed-positioned, always above everything -->
      <div
        v-if="visible"
        ref="menuRef"
        :style="computedMenuStyle"
        :class="['dropdown-menu', 'show', 'dropdown-teleport-menu']"
        @click="onClickInside"
      >
        <slot />
      </div>
    </Teleport>
  </div>
</template>
<script lang="ts">
  import { defineComponent, ref, nextTick, onBeforeUnmount } from 'vue'

  export default defineComponent({
    props: {
      variant:     { type: String,  default: 'link'  },
      align:       { type: String,  default: 'start' },
      direction:   { type: String,  default: 'down'  },
      toggleClass: { type: String,  default: ''      },
      menuStyle:   { type: String,  default: ''      },
      disabled:    { type: Boolean, default: false   },
    },
    setup(props) {
      const el      = ref<HTMLElement | null>(null)
      const menuRef = ref<HTMLElement | null>(null)
      const visible = ref(false)
      const computedMenuStyle = ref<Record<string, string>>({})

      const positionMenu = () => {
        if (!el.value || !menuRef.value) return
        const trigger = el.value.getBoundingClientRect()
        const menuH   = menuRef.value.offsetHeight || 160
        const menuW   = menuRef.value.offsetWidth  || 160
        const vw      = window.innerWidth
        const vh      = window.innerHeight

        // Vertical: respect direction prop, flip if no room
        let top: number
        if (props.direction === 'up' && trigger.top - menuH - 4 >= 0) {
          top = trigger.top - menuH - 4
        } else if (trigger.bottom + menuH + 4 <= vh) {
          top = trigger.bottom + 4
        } else {
          top = Math.max(4, trigger.top - menuH - 4)
        }

        // Horizontal: respect align prop, clamp to viewport
        let left: number
        if (props.align === 'end') {
          left = trigger.right - menuW
        } else if (props.align === 'center') {
          left = trigger.left + trigger.width / 2 - menuW / 2
        } else {
          left = trigger.left
        }
        if (left < 4) left = 4
        if (left + menuW > vw - 4) left = vw - menuW - 4

        computedMenuStyle.value = {
          position: 'fixed',
          top:      `${top}px`,
          left:     `${left}px`,
          zIndex:   '2000',
          minWidth: `${trigger.width}px`,
          ...(props.menuStyle ? { cssText: props.menuStyle } : {}),
        }
      }

      function toggle() {
        if (props.disabled) return
        visible.value = !visible.value
        if (visible.value) nextTick(positionMenu)
      }

      function close() {
        visible.value = false
      }

      function onClickInside(event: Event) {
        const target = event.target as (Element | null)
        if (target && ['A', 'BUTTON'].includes(target.tagName)) {
          close()
        }
      }

      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
      document.addEventListener('keydown', onKey)
      onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

      return {
        el,
        menuRef,
        visible,
        computedMenuStyle,
        toggle,
        close,
        onClickInside,
      }
    },
  })
</script>

<style scoped>
  .dropdown {
    display: inline-block;
  }

  .dropdown-toggle::after {
    display: none;
  }
</style>

<style>
  /* Backdrop: transparent, sits under the menu, above everything else */
  .dropdown-teleport-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1999;
  }

  /* Menu: always on top — z-index set inline too, this is belt-and-suspenders */
  .dropdown-teleport-menu {
    background: var(--theme-elevation-1);
    border: 1px solid var(--theme-elevation-2);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    z-index: 2000 !important;
  }
</style>
