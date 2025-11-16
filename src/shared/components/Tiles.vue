<template>
  <div :class="['tiles', 'tiles-square', { 'tiles-hs': allowHScroll }]">
    <slot />
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'

  export default defineComponent({
    props: {
      allowHScroll: { type: Boolean, default: false },
    },
  })
</script>
<style>
  .tiles {
    display: grid;
    grid-gap: 12px;
    grid-template-columns: repeat(auto-fit, 100px);
    justify-content: start;
    font-size: 0.75rem; /* base text size */
  }

  /* Horizontal scroll container */
  .tiles-hs {
    grid-template-columns: none;
    grid-auto-flow: column;
    grid-auto-columns: 100px;
    overflow-x: auto;

    /* Desktop scrollbar */
    scrollbar-color: rgba(0,0,0,0.3) transparent; /* Firefox */
  }

  /* Remove arrows on WebKit browsers (Chrome, Safari, Edge) */
  .tiles-hs::-webkit-scrollbar {
    height: 20px; /* thickness */
  }

  .tiles-hs::-webkit-scrollbar-button {
    display: none; /* remove arrows */
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
      grid-template-columns: repeat(auto-fit, 85px);
    }
    .tiles-hs {
      grid-auto-columns: 85px;
      scrollbar-width: none; /* Firefox */
    }
    .tiles-hs::-webkit-scrollbar {
      display: none; /* Chrome, Safari, Edge */
    }
  }

  /* Other styles */
  .tiles-square .tile-img {
    padding-bottom: 100%;
  }
</style>
