<template>
  <div
    :class="['tiles', 'tiles-square', { 'tiles-scroll': allowHScroll, 'custom-scroll': allowHScroll }]"
    :style="{
      '--tile-size': tileSize + 'px',
      '--tile-size-mobile': tileSizeMobile + 'px'
    }"
  >
    <slot />
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'

  export default defineComponent({
    props: {
      allowHScroll: { type: Boolean, default: false },
      tileSize: { type: Number, default: 110 }
    },
    computed: {
      tileSizeMobile(): number {
        return Math.round(this.tileSize * 0.85)
      }
    }
  })
</script>

<style>
  .tiles {
    display: grid;
    grid-gap: 12px;
    grid-template-columns: repeat(auto-fit, var(--tile-size));
    justify-content: start;
    font-size: 0.75rem;
    z-index: auto;
  }

  /* Horizontal scroll container */
  .tiles-scroll {
    grid-template-columns: none;
    grid-auto-flow: column;
    grid-auto-columns: var(--tile-size);
    overflow-x: auto;
    scrollbar-color: rgba(0,0,0,0.3) transparent;
  }

  .tiles-square .tile-img {
    padding-bottom: 100%;
  }
</style>
