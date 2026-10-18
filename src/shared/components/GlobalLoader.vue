// GlobalLoader.vue
<template>
  <transition name="fade">
    <img
      v-if="loader.loading"
      :src="spinner"
      alt="Loading..."
      width="80"
      height="80"
      class="spinner-png"
      aria-live="polite"
      aria-busy="true"
    >
  </transition>
</template>

<script setup lang="ts">
  import spinner from '@/shared/assets/spinner.svg?inline'
  import { useLoader } from '@/shared/loader'
  const loader = useLoader()
</script>

<style>
  .spinner-png {
    position: fixed;
    top: calc(50vh - 40px);
    left: calc(50vw - 40px);
    width: 80px;
    height: 80px;
    pointer-events: none;
    z-index: 99999;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .fade-enter-active, .fade-leave-active {
    transition: opacity 0.2s ease;
  }

  .fade-enter-from, .fade-leave-to {
    opacity: 0;
  }
</style>
