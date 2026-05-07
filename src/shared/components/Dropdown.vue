// Dropdown.vue
<template>
  <div ref="el" class="dropdown" :class="{ 'dropup': direction === 'up' }">
    <button
      type="button"
      :class="`btn btn-${variant} dropdown-toggle ${toggleClass}`"
      @click="toggle">
      <slot name="button-content" />
    </button>
    <div
      v-if="visible"
      :style="menuStyle"
      :class="['dropdown-menu', `dropdown-menu-${align}`, 'show']"
      @click="onClickInside"
    >
      <slot />
    </div>
  </div>
</template>
<script lang="ts">
  import { defineComponent, ref, } from 'vue'
  import { onClickOutside, useEventListener } from '@vueuse/core'

  export default defineComponent({
    props: {
      variant: { type: String, default: 'link' },
      align: { type: String, default: 'start' },
      direction: { type: String, default: 'down' },
      toggleClass: { type: String, default: '' },
      menuStyle: { type: String, default: '' },
      disabled: { type: Boolean, default: false },
    },
    setup() {
      const el = ref(null)
      const visible = ref(false)

      function toggle() {
        visible.value = !visible.value
      }

      function onClickInside(event: Event) {
        const target = event.target as (Element | null)
        if (target && ['A', 'BUTTON'].includes(target.tagName)) {
          visible.value = false
        }
      }

      onClickOutside(el, () => {
        visible.value = false
      })

      useEventListener(document, 'keyup', (event) => {
        if (event.key === 'Escape') {
          visible.value = false
        }
      })

      return {
        el,
        visible,
        toggle,
        onClickInside,
      }
    },
  })
</script>

<style scoped>
  .dropdown {
    display: inline-block;
  }

  .dropdown-menu {
    background: var(--theme-elevation-1);
    border: 1px solid var(--theme-elevation-2);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  }

  .dropdown-menu-end {
    right: 0;
  }

  .dropdown-menu-center {
    left: 50%;
    transform: translateX(-50%);
  }

  .dropdown-toggle::after {
    display: none;
  }

  .dropup {
    .dropdown-menu {
      bottom: 100%;
    }
  }
</style>
