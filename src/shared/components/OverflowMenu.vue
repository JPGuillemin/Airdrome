// OverflowMenu.vue
<template>
  <!--
    En mode "external" (ouvert via openAt() par un parent — ex: le
    contextmenu ou le long-press d'une ligne de tableau) ce composant ne
    rend aucun élément déclencheur en place, uniquement le menu téléporté.
    Cela permet de l'utiliser dans des contextes DOM qui n'acceptent que
    certains enfants (comme <tr>, qui n'accepte que <td>/<th>).
  -->
  <Teleport v-if="external" to="body">
    <div v-if="isOpen" class="overflow-menu-backdrop" @click.stop="close" @contextmenu.prevent.stop="close" />
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

  <div v-else ref="triggerRef" class="overflow-menu-wrap" @click.stop="toggle">
    <button
      v-longpress-tooltip
      class="btn p-0"
      :class="'btn-' + variant"
      :disabled="disabled"
      title="More actions"
      type="button"
    >
      <Icon icon="three-dots-vertical" />
    </button>

    <Teleport to="body">
      <!-- backdrop: closes menu on outside click -->
      <div v-if="isOpen" class="overflow-menu-backdrop" @click.stop="close" @contextmenu.prevent.stop="close" />

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

<script>
  import { defineComponent, ref, nextTick, onBeforeUnmount, watch } from 'vue'
  import { useRouter } from 'vue-router'

  var AUTO_CLOSE_MS = 5000

  export default defineComponent({
    props: {
      /** Disable the trigger button and programmatic opening. */
      disabled:  { type: Boolean, default: false },
      /** Bootstrap button variant used by the trigger. */
      variant:   { type: String,  default: 'link' },
      /** Preferred vertical direction: 'up' or 'down'. */
      direction: { type: String,  default: 'up'   },
      // Quand true, cette instance ne rend aucun bouton déclencheur —
      // elle est ouverte programmatiquement via openAt() par un parent
      // (ex: clic droit / long-press sur une ligne).
      /** Render no trigger; the menu is opened through openAt(). */
      external:  { type: Boolean, default: false },
    },

    setup: function (props) {
      var isOpen     = ref(false)
      var triggerRef = ref(null)
      var menuRef    = ref(null)
      var menuStyle  = ref({})

      // Point d'ancrage utilisé lors d'une ouverture programmatique
      // (contextmenu / long-press) au lieu du rect du bouton déclencheur.
      var anchor = null

      function positionMenu() {
        if (!menuRef.value) {
          return
        }

        var trigger = anchor

        if (!trigger && triggerRef.value) {
          trigger = triggerRef.value.getBoundingClientRect()
        }

        if (!trigger) {
          return
        }

        var menuH = menuRef.value.offsetHeight || 160
        var menuW = menuRef.value.offsetWidth  || 160
        var vw    = window.innerWidth
        var vh    = window.innerHeight

        // Prefer direction prop; flip if no room
        var top

        if (props.direction === 'up' && trigger.top - menuH - 4 >= 0) {
          top = trigger.top - menuH - 4
        } else if (trigger.bottom + menuH + 4 <= vh) {
          top = trigger.bottom + 4
        } else {
          top = Math.max(4, trigger.top - menuH - 4)
        }

        // Align to right edge of trigger; clamp to viewport
        var left = trigger.right - menuW

        if (left < 4) {
          left = 4
        }

        if (left + menuW > vw - 4) {
          left = vw - menuW - 4
        }

        menuStyle.value = {
          position: 'fixed',
          top:      top + 'px',
          left:     left + 'px',
          zIndex:   '2000',
        }
      }

      function toggle() {
        if (props.disabled || props.external) {
          return
        }

        anchor = null
        isOpen.value = !isOpen.value

        if (isOpen.value) {
          nextTick(positionMenu)
        }
      }

      // Ouvre le menu ancré à un point précis du viewport
      // (coordonnées du clic droit, ou rect de la ligne en long-press).
      /**
       * Open the menu anchored to a viewport rectangle.
       *
       * @param {Object} point
       * @param {number} point.top
       * @param {number} point.bottom
       * @param {number} point.left
       * @param {number} point.right
       * @returns {void}
       */
      function openAt(point) {
        if (props.disabled) {
          return
        }

        anchor = point
        isOpen.value = true
        nextTick(positionMenu)
      }

      /** Auto-close timer handle. */
      var autoCloseTimer = null

      function clearAutoCloseTimer() {
        if (autoCloseTimer !== null) {
          clearTimeout(autoCloseTimer)
          autoCloseTimer = null
        }
      }

      function close() {
        isOpen.value = false
        clearAutoCloseTimer()
      }

      // Auto-close after AUTO_CLOSE_MS while the menu is open
      watch(isOpen, function (open) {
        clearAutoCloseTimer()

        if (open) {
          autoCloseTimer = setTimeout(close, AUTO_CLOSE_MS)
        }
      })

      // Close on Escape
      function onKey(e) {
        if (e.key === 'Escape') {
          close()
        }
      }

      document.addEventListener('keydown', onKey)
      onBeforeUnmount(function () {
        document.removeEventListener('keydown', onKey)
        clearAutoCloseTimer()
      })

      // Close on route-back (browser back/forward, or programmatic nav)
      var router = useRouter()
      var stopRouterGuard = null

      if (router) {
        stopRouterGuard = router.afterEach(function () {
          close()
        })

        onBeforeUnmount(function () {
          if (stopRouterGuard) {
            stopRouterGuard()
          }
        })
      }

      return {
        isOpen: isOpen,
        triggerRef: triggerRef,
        menuRef: menuRef,
        menuStyle: menuStyle,
        toggle: toggle,
        close: close,
        openAt: openAt
      }
    },
  })
</script>

<style>
  .overflow-menu-wrap {
    display: inline-block;
  }

  /* Backdrop: transparent, sits under the menu, above everything else */
  .overflow-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1999;
  }

  /* Menu: always on top — z-index set inline too, this is belt-and-suspenders */
  .overflow-menu-list {
    z-index: 2000 !important;
    min-width: auto !important;
    width: max-content;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
</style>
