import { Directive } from 'vue'
import { Tooltip } from 'bootstrap'

export const longPressTooltip: Directive = {
  mounted(el) {
    let pressTimer: any = null
    let tip: Tooltip | null = null

    const showTooltip = () => {
      const text = el.getAttribute('title') || el.getAttribute('alt')
      if (!text) return

      // dispose previous
      tip?.dispose()

      // create tooltip attached to body
      tip = new Tooltip(el, {
        trigger: 'manual',
        placement: 'top',
        container: 'body',      // ← key fix
        boundary: 'viewport',   // avoid clipping
      })

      tip.show()   // let Bootstrap manage DOM
      tip.update?.()

      setTimeout(() => {
        tip?.hide()
        tip?.dispose()
        tip = null
      }, 2000)
    }

    const start = () => {
      if (pressTimer === null) pressTimer = setTimeout(showTooltip, 600)
    }

    const cancel = () => {
      if (pressTimer !== null) {
        clearTimeout(pressTimer)
        pressTimer = null
      }
    }

    // Mobile events
    el.addEventListener('touchstart', start)
    el.addEventListener('touchend', cancel)
    el.addEventListener('touchmove', cancel)
    el.addEventListener('touchcancel', cancel)

    // cleanup
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
