// TrackMenu.vue
<template>
  <div ref="el" class="dropdown">
    <button
      type="button"
      :class="'btn btn-' + variant + ' dropdown-toggle ' + toggleClass"
      title="Menu"
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
<script>
  import { defineComponent, ref, nextTick, onBeforeUnmount } from 'vue'

  export default defineComponent({
    props: {
      /** Bootstrap button variant used by the trigger. */
      variant:     { type: String,  default: 'link'  },
      /** Horizontal menu alignment: 'start', 'center' or 'end'. */
      align:       { type: String,  default: 'start' },
      /** Preferred vertical direction: 'up' or 'down'. */
      direction:   { type: String,  default: 'down'  },
      /** Extra class applied to the trigger. */
      toggleClass: { type: String,  default: ''      },
      /** Optional CSS text forwarded to the menu. */
      menuStyle:   { type: String,  default: ''      },
      /** Disable the trigger. */
      disabled:    { type: Boolean, default: false   },
    },
    setup: function (props) {
      var el      = ref(null)
      var menuRef = ref(null)
      var visible = ref(false)
      var computedMenuStyle = ref({})

      function positionMenu() {
        if (!el.value || !menuRef.value) {
          return
        }

        var trigger = el.value.getBoundingClientRect()
        var menuH   = menuRef.value.offsetHeight || 160
        var menuW   = menuRef.value.offsetWidth  || 160
        var vw      = window.innerWidth
        var vh      = window.innerHeight

        // Vertical: respect direction prop, flip if no room
        var top

        if (props.direction === 'up' && trigger.top - menuH - 4 >= 0) {
          top = trigger.top - menuH - 4
        } else if (trigger.bottom + menuH + 4 <= vh) {
          top = trigger.bottom + 4
        } else {
          top = Math.max(4, trigger.top - menuH - 4)
        }

        // Horizontal: respect align prop, clamp to viewport
        var left

        if (props.align === 'end') {
          left = trigger.right - menuW
        } else if (props.align === 'center') {
          left = trigger.left + trigger.width / 2 - menuW / 2
        } else {
          left = trigger.left
        }

        if (left < 4) {
          left = 4
        }

        if (left + menuW > vw - 4) {
          left = vw - menuW - 4
        }

        var style = {
          position: 'fixed',
          top:      top + 'px',
          left:     left + 'px',
          zIndex:   '2000',
          minWidth: trigger.width + 'px',
        }

        if (props.menuStyle) {
          style.cssText = props.menuStyle
        }

        computedMenuStyle.value = style
      }

      function toggle() {
        if (props.disabled) {
          return
        }

        visible.value = !visible.value

        if (visible.value) {
          nextTick(positionMenu)
        }
      }

      function close() {
        visible.value = false
      }

      function onClickInside(event) {
        var target = event.target

        if (target && (target.tagName === 'A' || target.tagName === 'BUTTON')) {
          close()
        }
      }

      function onKey(e) {
        if (e.key === 'Escape') {
          close()
        }
      }

      document.addEventListener('keydown', onKey)
      onBeforeUnmount(function () {
        document.removeEventListener('keydown', onKey)
      })

      return {
        el: el,
        menuRef: menuRef,
        visible: visible,
        computedMenuStyle: computedMenuStyle,
        toggle: toggle,
        close: close,
        onClickInside: onClickInside,
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
    background: var(--theme-elevation-2);
    border: 1px solid var(--theme-elevation-3);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    z-index: 2000 !important;
  }
</style>
