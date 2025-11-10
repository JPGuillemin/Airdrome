<template>
  <div class="hero-container">
    <div
      class="backdrop"
      :style="{
        '--backgroundImage': `url('${image || fallbackImage}')`,
        '--blurAmount': blur
      }"
    />
    <div class="hero-content">
      <img
        :src="image || fallbackImage"
        :title="hover"
        class="album-cover cursor-pointer"
        @click="$emit('click')"
      >
      <div class="content">
        <slot />
      </div>
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
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 1rem 0;
    height: 170px;
  }

  .hero-content {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 0.5rem;
    width: 100%;
    box-sizing: border-box;
  }

  .album-cover {
    width: 160px;
    height: 160px;
    object-fit: cover;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .backdrop {
    position: absolute;
    top: -10px;
    left: -10px;
    width: calc(100% + 20px);
    height: calc(100% + 20px);
    z-index: -1;
    opacity: 0.6;
    filter: blur(var(--blurAmount));
    background-image: linear-gradient(to bottom, transparent, black), var(--backgroundImage);
    background-size: cover;
    background-position: center;
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-left: 1rem;
  }
</style>
