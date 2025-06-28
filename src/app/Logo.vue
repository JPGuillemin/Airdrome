<template>
  <div class="d-flex align-items-end logo-container"
       :class="$data.staticClass || ''"
       v-bind="$data.attrs">
    <router-link class="flex-grow-1 flex-md-grow-0 ms-auto me-2" :to="{name: 'home'}" title="Home panel" exact>
      <img width="52" height="52" src="@/shared/assets/logo.svg">
    </router-link>
    <span class="text-body ms-2 text-nowrap">
      <span>Airdrome</span>
    </span>
  </div>
</template>
<style scoped>
  svg {
    fill: var(--bs-primary);
    height: 32px;
    margin-bottom: 2px;
  }
</style>
