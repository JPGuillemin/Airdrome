<template>
  <div
    :class="['tiles', 'tiles-square', { 'tiles-hs': allowHScroll }]"
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
  }

  /* Horizontal scroll container */
  .tiles-hs {
    grid-template-columns: none;
    grid-auto-flow: column;
    grid-auto-columns: var(--tile-size);
    overflow-x: auto;
    scrollbar-color: rgba(0,0,0,0.3) transparent;
  }

  /* Remove arrows on WebKit browsers */
  .tiles-hs::-webkit-scrollbar {
    height: 20px;
  }
  .tiles-hs::-webkit-scrollbar-button {
    display: none;
    border-radius: 10px;
  }
  .tiles-hs::-webkit-scrollbar-thumb {
    background-color: rgba(0,0,0,0.3);
    border-radius: 10px;
  }
  .tiles-hs::-webkit-scrollbar-track {
    background: transparent;
  }

  /* Mobile styles */
  @media(max-width: 654px) {
    .tiles {
      grid-gap: 6px;
      font-size: 0.65rem;
      grid-template-columns: repeat(auto-fit, var(--tile-size-mobile));
    }
    .tiles-hs {
      grid-auto-columns: var(--tile-size-mobile);
      scrollbar-width: none;
    }
    .tiles-hs::-webkit-scrollbar {
      display: none;
    }
  }

  /* Other styles */
  .tiles-square .tile-img {
    padding-bottom: 100%;
  }
</style>
