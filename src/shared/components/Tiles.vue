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
    grid-template-columns: repeat(auto-fill, minmax(min(100% / 3, 100px), 1fr));
    font-size: 0.75rem; /* base text size */
  }

  .tiles-container::-webkit-scrollbar {
    display: none; /* Chrome, Safari, Edge */
  }

  .tiles-square .tile-img {
    padding-bottom: 100%;
  }

  .tiles-rect .tile-img {
    padding-bottom: 70%;
  }

  @media(max-width: 654px) {
    .tiles-hs {
      grid-template-columns: none;
      grid-auto-flow: column;
      grid-auto-columns: minmax(min(100% / 2 - 1em, 85px), 1fr);
      overflow-x: auto;
      scrollbar-width: none;
    }
    .tiles-hs::-webkit-scrollbar {
      display: none; /* Chrome, Safari, Edge */
    }
  }

  @media(max-width: 442px) {
    .tiles {
      grid-gap: 6px;
      font-size: 0.65rem;
      grid-template-columns: repeat(auto-fill, minmax(85px, 1fr));
    }
  }
</style>
