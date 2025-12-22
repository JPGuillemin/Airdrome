<template>
  <div
    :class="[
      'tiles',
      'tiles-square',
      {
        'tiles-scroll': allowHScroll,
        'custom-scroll': allowHScroll,
        'tiles-twin-rows': twinRows,
      }
    ]"
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
      tileSize: { type: Number, default: 110 },
      twinRows: { type: Boolean, default: false },
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

  /* Twin rows scrolling together */
  .tiles-twin-rows.tiles-scroll {
    grid-auto-flow: column;
    grid-template-rows: repeat(2, auto);
    grid-auto-columns: var(--tile-size-active);
  }

  /* Ensure square tiles */
  .tiles-square .tile-img {
    padding-bottom: 100%;
  }
</style>
