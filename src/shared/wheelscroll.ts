import type { DirectiveBinding } from 'vue'

interface WheelScrollOptions {
  enabled?: boolean
  speed?: number
  friction?: number
}

export default {
  mounted(el: HTMLElement, binding: DirectiveBinding<WheelScrollOptions | boolean>) {
    const opts: WheelScrollOptions =
      typeof binding.value === 'boolean'
        ? { enabled: binding.value }
        : binding.value || {}

    const enabled = opts.enabled !== false
    if (!enabled) return

    const speed = opts.speed ?? 1
    const friction = opts.friction ?? 0.9

    let velocity = 0
    let rafId: number | null = null

    const animate = () => {
      if (Math.abs(velocity) < 0.1) {
        velocity = 0
        rafId = null
        return
      }

      el.scrollLeft += velocity
      velocity *= friction

      rafId = requestAnimationFrame(animate)
    }

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return

      const canScroll = el.scrollWidth > el.clientWidth
      if (!canScroll) return

      e.preventDefault()

      velocity += e.deltaY * speed

      if (!rafId) {
        rafId = requestAnimationFrame(animate)
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })

    ;(el as any).__wheelScrollCleanup__ = () => {
      el.removeEventListener('wheel', onWheel)
      if (rafId) cancelAnimationFrame(rafId)
    }
  },

  unmounted(el: HTMLElement) {
    (el as any).__wheelScrollCleanup__?.()
  }
}
