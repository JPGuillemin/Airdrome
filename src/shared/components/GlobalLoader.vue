<template>
  <div v-if="ui.loading" class="loader-overlay">
    <img src="@/shared/assets/spinner.svg" alt="Loading..." class="spinner-svg">
  </div>
</template>

<script setup lang="ts">
  import { useUiStore } from '@/shared/ui'
  const ui = useUiStore()
</script>

<style>
  .loader-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
    z-index: 99999;
  }

  .spinner-svg {
    width: 80px;
    height: 80px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
