// Tiles.vue
<template>
  <div
    class="tiles-wrapper"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <!-- Left Arrow -->
    <button
      v-if="allowHScroll && !isMobile && isHovering"
      class="scroll-arrow scroll-arrow-left"
      :disabled="!showLeftArrow"
      @click="scrollLeft"
      aria-label="Scroll left"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    </button>

    <!-- Right Arrow -->
    <button
      v-if="allowHScroll && !isMobile && isHovering"
      class="scroll-arrow scroll-arrow-right"
      :disabled="!showRightArrow"
      @click="scrollRight"
      aria-label="Scroll right"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </button>

    <!-- Scrolling Container -->
    <div
      ref="tilesContainer"
      v-wheel-scroll="{ enabled: allowHScroll && isMobile, speed: 0.9, friction: 0.88 }"
      :class="[
        'tiles',
        'tiles-square',
        {
          'tiles-scroll': allowHScroll,
          'scroll': allowHScroll,
          'tiles-three-rows': threeRows,
        }
      ]"
      :style="{
        '--tile-size': tileSize + 'px',
        '--tile-size-mobile': tileSizeMobile + 'px'
      }"
      @scroll="updateScrollState"
    >
      <slot />
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref, onMounted, onUnmounted } from 'vue'

  export default defineComponent({
    props: {
      allowHScroll: { type: Boolean, default: false },
      tileSize: { type: Number, default: 110 },
      threeRows: { type: Boolean, default: false },
    },
    setup(props) {
      const tilesContainer = ref<HTMLElement | null>(null)
      const isMobile = ref(false)
      const isHovering = ref(false)
      const showLeftArrow = ref(false)
      const showRightArrow = ref(false)

      const checkIfMobile = () => {
        isMobile.value = window.innerWidth <= 768
      }

      const updateScrollState = () => {
        if (!tilesContainer.value) return

        const { scrollLeft, scrollWidth, clientWidth } = tilesContainer.value

        // Show left arrow if we can scroll left
        showLeftArrow.value = scrollLeft > 0

        // Show right arrow if we can scroll right
        showRightArrow.value = scrollLeft < scrollWidth - clientWidth - 1
      }

      const scrollLeft = () => {
        if (!tilesContainer.value) return
        const scrollAmount = tilesContainer.value.clientWidth * 0.8
        tilesContainer.value.scrollBy({
          left: -scrollAmount,
          behavior: 'smooth'
        })
      }

      const scrollRight = () => {
        if (!tilesContainer.value) return
        const scrollAmount = tilesContainer.value.clientWidth * 0.8
        tilesContainer.value.scrollBy({
          left: scrollAmount,
          behavior: 'smooth'
        })
      }

      const onMouseEnter = () => {
        if (!isMobile.value) {
          isHovering.value = true
          updateScrollState()
        }
      }

      const onMouseLeave = () => {
        isHovering.value = false
      }

      onMounted(() => {
        checkIfMobile()
        window.addEventListener('resize', checkIfMobile)

        // Initial scroll state check
        if (tilesContainer.value) {
          updateScrollState()
        }
      })

      onUnmounted(() => {
        window.removeEventListener('resize', checkIfMobile)
      })

      return {
        tilesContainer,
        isMobile,
        isHovering,
        showLeftArrow,
        showRightArrow,
        scrollLeft,
        scrollRight,
        onMouseEnter,
        onMouseLeave,
        updateScrollState,
        tileSizeMobile: Math.round(props.tileSize * 0.85)
      }
    }
  })
</script>

<style>
  /* Wrapper that holds arrows in place */
  .tiles-wrapper {
    position: relative;
    width: 100%;
  }

  .tiles {
    --tile-size-active: var(--tile-size);
    display: grid;
    gap: 12px;
    font-size: 0.75rem;
    justify-content: start;
  }

  /* Mobile override */
  @media (max-width: 768px) {
    .tiles {
      --tile-size-active: var(--tile-size-mobile);
      font-size: 0.65rem;
    }
  }

  /* Default grid */
  .tiles:not(.tiles-scroll) {
    grid-template-columns: repeat(auto-fit, var(--tile-size-active));
  }

  /* Horizontal scroll (single row) */
  .tiles-scroll {
    grid-auto-flow: column;
    grid-auto-columns: var(--tile-size-active);
    overflow-x: auto;
    scrollbar-color: rgba(0,0,0,0.3) transparent;
  }

  /* Three rows scrolling together */
  .tiles-three-rows.tiles-scroll {
    grid-auto-flow: column;
    grid-template-rows: repeat(3, auto);
    /* image + text + gap */
    grid-auto-columns: calc(var(--tile-size-active) + 100px + 8px);
  }

  /* Ensure square tiles */
  .tiles-square .tile-img {
    padding-bottom: 100%;
  }

  /* Scroll Arrows - positioned relative to wrapper, not scrolling container */
  .scroll-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    transition: all 0.2s ease-in-out;
    opacity: 0;
    animation: fadeIn 0.2s ease-in-out forwards;
  }

  @keyframes fadeIn {
    to {
      opacity: 1;
    }
  }

  .scroll-arrow:hover {
    background: rgba(0, 0, 0, 0.85);
    transform: translateY(-50%) scale(1.1);
  }

  .scroll-arrow:active {
    transform: translateY(-50%) scale(0.95);
  }

  /* Disabled state */
  .scroll-arrow:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    background: rgba(0, 0, 0, 0.5);
  }

  .scroll-arrow:disabled:hover {
    background: rgba(0, 0, 0, 0.5);
    transform: translateY(-50%);
  }

  .scroll-arrow-left {
    left: 8px;
  }

  .scroll-arrow-right {
    right: 8px;
  }

  /* Hide scrollbar on desktop when arrows are present */
  @media (min-width: 769px) {
    .tiles-scroll {
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE/Edge */
    }

    .tiles-scroll::-webkit-scrollbar {
      display: none; /* Chrome/Safari */
    }
  }
</style>
