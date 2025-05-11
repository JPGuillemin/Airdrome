<template>
  <div class="d-flex align-items-end logo-container"
       :class="$data.staticClass || ''"
       v-bind="$data.attrs">
    <img width="52" height="52" src="@/shared/assets/logo.svg">
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
