import { Directive } from 'vue'
import { Tooltip } from 'bootstrap'

export const longPressTooltip: Directive = {
  mounted(el) {
    let pressTimer: any = null
    let tip: Tooltip | null = null

    const showTooltip = () => {
      // Read title (for buttons) or alt (for images)
      const text = el.getAttribute('title') || el.getAttribute('alt')
      if (!text) return

      // Temporarily set title for Bootstrap tooltip
      el.setAttribute('title', text)

      tip = new Tooltip(el, { trigger: 'manual' })
      tip.show()
      tip.update?.() // recompute position (safe for scrollable containers)

      // Hide after 2s
      setTimeout(() => {
        tip?.hide()
        tip?.dispose()
        tip = null
      }, 2000)
    }

    const start = () => {
      if (pressTimer === null) {
        pressTimer = setTimeout(() => {
          showTooltip()
        }, 600) // long-press threshold
      }
    }

    const cancel = () => {
      if (pressTimer !== null) {
        clearTimeout(pressTimer)
        pressTimer = null
      }
    }

    // Mobile touch events
    el.addEventListener('touchstart', start)
    el.addEventListener('touchend', cancel)
    el.addEventListener('touchmove', cancel)
    el.addEventListener('touchcancel', cancel)

    // Cleanup reference
    ;(el as any)._longPressCleanup = () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchend', cancel)
      el.removeEventListener('touchmove', cancel)
      el.removeEventListener('touchcancel', cancel)
      tip?.dispose()
    }
  },
  unmounted(el) {
    (el as any)._longPressCleanup?.()
  },
}
