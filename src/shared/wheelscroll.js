// wheelscroll.js

/**
 * Turn vertical wheel movement into horizontal scrolling with momentum.
 *
 * Bind as `v-wheel-scroll` with either a boolean or an options object
 * `{ enabled, speed, friction }`.
 */
export default {
  mounted: function(el, binding) {
    var opts

    if (typeof binding.value === 'boolean') {
      opts = { enabled: binding.value }
    } else {
      opts = binding.value || {}
    }

    var enabled = opts.enabled !== false

    if (!enabled) {
      return
    }

    var speed = 1

    if (opts.speed != null) {
      speed = opts.speed
    }

    var friction = 0.9

    if (opts.friction != null) {
      friction = opts.friction
    }

    var velocity = 0
    var rafId = null

    var animate = function() {
      if (Math.abs(velocity) < 0.1) {
        velocity = 0
        rafId = null
        return
      }

      el.scrollLeft += velocity
      velocity *= friction

      rafId = requestAnimationFrame(animate)
    }

    var onWheel = function(e) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        return
      }

      var canScroll = el.scrollWidth > el.clientWidth

      if (!canScroll) {
        return
      }

      e.preventDefault()

      velocity += e.deltaY * speed

      if (!rafId) {
        rafId = requestAnimationFrame(animate)
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })

    el.__wheelScrollCleanup__ = function() {
      el.removeEventListener('wheel', onWheel)

      if (rafId) {
        cancelAnimationFrame(rafId)
      }
    }
  },

  unmounted: function(el) {
    if (el.__wheelScrollCleanup__) {
      el.__wheelScrollCleanup__()
    }
  }
}
