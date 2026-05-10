// Header.vue
<template>
  <div class="header-container">
    <div
      class="header-backdrop"
      :style="{
        '--backgroundImage': `url('${image || fallbackImage}')`,
        '--blurAmount': blur
      }"
    />
    <div class="header">
      <img
        :src="image || fallbackImage"
        :title="hover"
        class="cover-image cursor-pointer"
        @click="$emit('click')"
      >
      <div class="header-content">
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
  .header-container {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 1rem 0;
    height: 190px;
  }

  .header {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 0.5rem;
    width: 100%;
    box-sizing: border-box;
  }

  .cover-image {
    width: 150px;
    height: 150px;
    object-fit: cover;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .header-backdrop {
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

  .header-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-left: 1rem;
  }
</style>
