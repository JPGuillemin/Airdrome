import { Directive } from 'vue'
import { Tooltip } from 'bootstrap'

export const longPressTooltip: Directive = {
  mounted(el) {
    let pressTimer: number | null = null

    const showTooltip = () => {
      const text = el.getAttribute('title')
      if (!text) return

      // Create tooltip
      const tip = new Tooltip(el, {
        trigger: 'manual',
        placement: 'top',
        container: 'body',
      })

      tip.show()

      // Force z-index above navbar
      const tipEl = document.querySelector('.tooltip') as HTMLElement
      if (tipEl) tipEl.style.zIndex = '2200'

      // Store reference on element for cleanup
      ;(el as any)._tooltipInstance = tip

      setTimeout(() => {
        tip.hide()
        tip.dispose()
        (el as any)._tooltipInstance = null
      }, 2000)
    }

    const start = () => {
      pressTimer = window.setTimeout(showTooltip, 600)
    }

    const cancel = () => {
      if (pressTimer) {
        clearTimeout(pressTimer)
        pressTimer = null
      }
    }

    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchend', cancel)
    el.addEventListener('touchmove', cancel)
    el.addEventListener('touchcancel', cancel)

    // Store cleanup on element
    ;(el as any)._longPressCleanup = () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchend', cancel)
      el.removeEventListener('touchmove', cancel)
      el.removeEventListener('touchcancel', cancel)
      ;(el as any)._tooltipInstance?.dispose()
    }
  },

  unmounted(el) {
    ;(el as any)._longPressCleanup?.()
    ;(el as any)._tooltipInstance?.dispose()
  },
}
