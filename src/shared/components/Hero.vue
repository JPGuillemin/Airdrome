<template>
  <div class="d-flex flex-column flex-md-row align-items-center position-relative mb-3">
    <div
      class="backdrop"
      :style="{
        '--backgroundImage': `url('${image || fallbackImage}')`,
        '--blurAmount': blur
      }"
    />
    <img
      v-if="image"
      :src="image"
      class="album-cover cursor-pointer"
      @click="$emit('click')"
    >
    <img
      v-else
      :src="fallbackImage"
      class="album-cover cursor-pointer"
      @click="$emit('click')"
    >
    <div class="d-flex flex-column align-items-center align-items-md-start pt-4 pt-md-0 ps-md-4 pb-1 text-center text-md-start">
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
      blur: { type: String, default: '8px' } // configurable blur
    },
    emits: ['click'],
    setup() {
      return { fallbackImage }
    },
  })
</script>

<style scoped>
  img {
    display: block;
    width: 300px;
    height: auto;
    max-width: 75%;
    aspect-ratio: 1;
    object-fit: cover;
  }

  .backdrop {
    position: absolute;
    z-index: -1;
    width: 100%;
    top: -50%;
    height: calc(100% + 300px);
    transform: scale(1.025);
    filter: blur(var(--blurAmount));
    opacity: 0.25;
    background-size: max(100%, 1000px) auto;
    background-position: center center;
    background-repeat: no-repeat;
    background-image:
      linear-gradient(to bottom, transparent, black),
      var(--backgroundImage);
  }
</style>
