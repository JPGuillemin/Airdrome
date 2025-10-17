<template>
  <div v-if="loader.loading" class="loader-overlay">
    <img src="@/shared/assets/spinner.png" alt="Loading..." class="spinner-png">
  </div>
</template>

<script setup lang="ts">
  import { useLoader } from '@/shared/loader'
  const loader = useLoader()
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

  .spinner-png {
    width: 80px;
    height: 80px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
