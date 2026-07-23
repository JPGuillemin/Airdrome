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
      class="btn p-0"
      :class="`btn-${variant}`"
      :disabled="disabled"
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

<script lang="ts">
  import { defineComponent, ref, nextTick, onBeforeUnmount } from 'vue'

  export default defineComponent({
    props: {
      disabled:  { type: Boolean, default: false },
      variant:   { type: String,  default: 'link' },
      direction: { type: String,  default: 'up'   },
      // Quand true, cette instance ne rend aucun bouton déclencheur —
      // elle est ouverte programmatiquement via openAt() par un parent
      // (ex: clic droit / long-press sur une ligne).
      external:  { type: Boolean, default: false },
    },

    setup(props) {
      const isOpen     = ref(false)
      const triggerRef = ref<HTMLElement | null>(null)
      const menuRef    = ref<HTMLElement | null>(null)
      const menuStyle  = ref<Record<string, string>>({})

      // Point d'ancrage utilisé lors d'une ouverture programmatique
      // (contextmenu / long-press) au lieu du rect du bouton déclencheur.
      let anchor: { top: number; bottom: number; left: number; right: number } | null = null

      const positionMenu = () => {
        if (!menuRef.value) return
        const trigger = anchor ?? triggerRef.value?.getBoundingClientRect()
        if (!trigger) return

        const menuH = menuRef.value.offsetHeight || 160
        const menuW = menuRef.value.offsetWidth  || 160
        const vw    = window.innerWidth
        const vh    = window.innerHeight

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
        }
      }

      const toggle = () => {
        if (props.disabled || props.external) return
        anchor = null
        isOpen.value = !isOpen.value
        if (isOpen.value) nextTick(positionMenu)
      }

      // Ouvre le menu ancré à un point précis du viewport
      // (coordonnées du clic droit, ou rect de la ligne en long-press).
      const openAt = (point: { top: number; bottom: number; left: number; right: number }) => {
        if (props.disabled) return
        anchor = point
        isOpen.value = true
        nextTick(positionMenu)
      }

      const close = () => { isOpen.value = false }

      // Close on Escape
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
      document.addEventListener('keydown', onKey)
      onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

      return { isOpen, triggerRef, menuRef, menuStyle, toggle, close, openAt }
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
    /* Bootstrap's .dropdown-menu forces min-width: 10rem by default,
       which is why this ends up much wider than its content (e.g. the
       vertical volume slider). Let it size to content instead. */
    min-width: auto !important;
    width: max-content;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
</style>
