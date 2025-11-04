<template>
  <div class="hero-container d-flex flex-column flex-md-row align-items-center position-relative mb-3">
    <div
      class="backdrop"
      :style="{
        '--backgroundImage': `url('${image || fallbackImage}')`,
        '--blurAmount': blur
      }"
    />

    <img
      :src="image || fallbackImage"
      :title="hover"
      class="album-cover cursor-pointer"
      @click="$emit('click')"
    >

    <div class="content d-flex flex-column align-items-center align-items-md-start pt-4 pt-md-0 ps-md-4 pb-1 text-center text-md-start">
      <slot />
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import fallbackImage from '@/shared/assets/fallback.svg'

  export default defineComponent({
    props: {
      image: { type: String, default: null },
      blur: { type: String, default: '7px' },
      hover: { type: String, default: null },
    },
    emits: ['click'],
    setup() {
      return { fallbackImage }
    }
  })
</script>

<style scoped>
  .hero-container {
    position: relative;
    overflow: visible;
    padding: 1rem 0;
    height: 170px;
  }

  /* On small screens (mobile), add ~160px */
  @media (max-width: 767.98px) {
    .hero-container {
      height: 320px;
      flex-direction: column;
      text-align: center;
    }
  }

  .album-cover {
    display: block;
    width: 160px;
    height: 160px;
    object-fit: cover;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .backdrop {
    position: absolute;
    z-index: -1;
    top: -10px;
    left: -10px;
    width: calc(100% + 20px);
    height: calc(100% + 20px);
    filter: blur(var(--blurAmount));
    opacity: 0.6;
    background-size: cover;
    background-position: center center;
    background-repeat: no-repeat;
    background-image:
      linear-gradient(to bottom, transparent, black),
      var(--backgroundImage);
  }

  .content {
    min-width: 0;
    flex: 1 1 auto;
}
</style>
