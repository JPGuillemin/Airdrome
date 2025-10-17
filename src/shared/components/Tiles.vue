<template>
  <div :class="['tiles', square ? 'tiles-square' : 'tiles-rect', { 'tiles-hs': allowHScroll }]">
    <slot />
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'

  export default defineComponent({
    props: {
      square: { type: Boolean, default: false },
      allowHScroll: { type: Boolean, default: false },
    },
  })
</script>
<style>
  .tiles {
    display: grid;
    grid-gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(min(100% / 3, 150px), 1fr));
    font-size: 0.75rem; /* base text size */
  }

  /* Tile variants */
  .tiles-square .tile-img {
    padding-bottom: 100%;
  }

  .tiles-rect .tile-img {
    padding-bottom: 70%;
  }

  /* Horizontal scroll before breaking to 2 columns */
  @media(max-width: 654px) {
    .tiles-hs {
      grid-template-columns: none;
      grid-auto-flow: column;
      grid-auto-columns: minmax(min(100% / 2 - 1em, 100px), 1fr);
      overflow-x: auto;
    }
  }

  /* Mobile adjustments */
  @media(max-width: 442px) {
    .tiles {
      grid-gap: 6px;
      font-size: 0.65rem;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    }

    /* Text adjustments */
    .tiles .tile .card-body {
      font-size: 0.65rem;
      padding-inline: 4px;
    }
    .tiles .tile .text-truncate.fw-bold { font-size: 0.7rem; }
    .tiles .tile .text-truncate.text-muted { font-size: 0.65rem; }

    /* Preserve squares & circles */
    .tiles-square .tile-img { padding-bottom: 100%; }
    .tiles-square .tile-img--circle { border-radius: 50%; overflow: hidden; }

    /* Rectangles shrink slightly */
    .tiles-rect .tile-img { padding-bottom: 70%; }
  }
</style>
