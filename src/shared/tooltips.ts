// tooltips.ts
import { Directive, inject } from 'vue'

type LongPressEl = HTMLElement & {
  _lpCleanup?: () => void
}

export const longPressTooltip: Directive = {
  mounted(el: LongPressEl) {
    let pressTimer: ReturnType<typeof setTimeout> | null = null
    let hideTimer: ReturnType<typeof setTimeout> | null = null
    let tooltipEl: HTMLDivElement | null = null

    const getText = () =>
      el.getAttribute('title') ||
      el.getAttribute('aria-label') ||
      el.getAttribute('alt') ||
      ''

    const removeTooltip = () => {
      if (hideTimer) {
        clearTimeout(hideTimer)
        hideTimer = null
      }

      if (tooltipEl) {
        tooltipEl.remove()
        tooltipEl = null
      }
    }

    const createTooltip = () => {
      const text = getText()
      if (!text) return

      removeTooltip()

      const rect = el.getBoundingClientRect()
      const tip = document.createElement('div')
      tooltipEl = tip

      tip.textContent = text
      tip.className = 'lp-tooltip'
      tip.style.background = 'rgba(0, 0, 0, 0.72)'
      tip.style.color = '#fff'
      tip.style.padding = '8px 10px'
      tip.style.borderRadius = '10px'
      tip.style.backdropFilter = 'blur(6px)'
      tip.style.maxWidth = '220px'
      tip.style.fontSize = '14px'
      tip.style.lineHeight = '1.35'
      tip.style.textAlign = 'center'
      tip.style.boxShadow = '0 6px 18px rgba(0,0,0,0.18)'
      tip.style.fontWeight = '500'
      tip.style.letterSpacing = '0.2px'
      tip.style.position = 'fixed'
      tip.style.left = `${rect.left + rect.width / 2}px`
      tip.style.transform = 'translateX(-50%)'
      tip.style.zIndex = '99999'
      tip.style.pointerEvents = 'none'

      document.body.appendChild(tip)

      const tipRect = tip.getBoundingClientRect()

      const isMobile = matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0

      // MOBILE: place tooltip BELOW the element so it won't sit under finger
      if (isMobile) {
        tip.style.top = `${rect.bottom + 14}px`
      } else {
        // DESKTOP: above element
        tip.style.top = `${rect.top - tipRect.height - 12}px`
      }

      // Keep inside viewport horizontally
      const finalRect = tip.getBoundingClientRect()

      if (finalRect.left < 8) {
        tip.style.left = `${finalRect.width / 2 + 8}px`
      }

      if (finalRect.right > window.innerWidth - 8) {
        tip.style.left = `${
          window.innerWidth - finalRect.width / 2 - 8
        }px`
      }

      // If mobile bottom placement overflows, move above instead
      if (isMobile && finalRect.bottom > window.innerHeight - 8) {
        tip.style.top = `${rect.top - finalRect.height - 12}px`
      }

      // If desktop top placement overflows, move below instead
      if (!isMobile && finalRect.top < 8) {
        tip.style.top = `${rect.bottom + 14}px`
      }

      requestAnimationFrame(() => {
        tip.classList.add('show')
      })

      hideTimer = setTimeout(removeTooltip, 1600)
    }

    const start = () => {
      if (pressTimer) clearTimeout(pressTimer)

      pressTimer = setTimeout(() => {
        createTooltip()
        pressTimer = null
      }, 550)
    }

    const cancel = () => {
      if (pressTimer) {
        clearTimeout(pressTimer)
        pressTimer = null
      }
    }

    const move = () => {
      cancel()
    }

    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchend', cancel, { passive: true })
    el.addEventListener('touchcancel', cancel, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })

    el.addEventListener('mousedown', start)
    el.addEventListener('mouseup', cancel)
    el.addEventListener('mouseleave', cancel)

    el._lpCleanup = () => {
      cancel()
      removeTooltip()

      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchend', cancel)
      el.removeEventListener('touchcancel', cancel)
      el.removeEventListener('touchmove', move)

      el.removeEventListener('mousedown', start)
      el.removeEventListener('mouseup', cancel)
      el.removeEventListener('mouseleave', cancel)
    }
  },

  unmounted(el: LongPressEl) {
    el._lpCleanup?.()
  },
}
