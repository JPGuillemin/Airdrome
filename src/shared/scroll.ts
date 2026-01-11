import { Ref, onMounted, onBeforeUnmount, nextTick } from 'vue'

export function useHorizontalScrollbar(
  scrollEl: Ref<HTMLElement | null>,
  thumbEl: Ref<HTMLElement | null>
) {
  const syncThumb = () => {
    if (!scrollEl.value || !thumbEl.value) return

    const el = scrollEl.value
    const barWidth = el.clientWidth
    const scrollWidth = el.scrollWidth

    if (scrollWidth <= barWidth) {
      thumbEl.value.style.width = '0'
      return
    }

    const ratio = barWidth / scrollWidth
    const thumbWidth = Math.max(barWidth * ratio, 30)
    const maxX = barWidth - thumbWidth
    const scrollRatio = el.scrollLeft / (scrollWidth - barWidth)

    thumbEl.value.style.width = `${thumbWidth}px`
    thumbEl.value.style.transform = `translateX(${maxX * scrollRatio}px)`
  }

  const onResize = () => syncThumb()

  onMounted(async() => {
    await nextTick()
    syncThumb()
    window.addEventListener('resize', onResize)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize)
  })

  return {
    syncThumb
  }
}
