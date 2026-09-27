// TileActionButton.vue
<template>
  <button
    type="button"
    class="tile-action"
    :aria-label="label"
    :title="label"
    @click="$emit('click', $event)"
  >
    <Icon :icon="icon" />
  </button>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'

  export default defineComponent({
    props: {
      icon: { type: String, required: true },
      label: { type: String, default: '' },
    },
    emits: ['click'],
  })
</script>

<style>
  .tile-action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    margin: 0;
    border: none;
    border-radius: 0;
    background: none;
    box-shadow: none;
    outline: none;

    color: #fff;
    font-size: 16px;
    line-height: 1;

    cursor: pointer;
    transition:
      color 0.15s ease,
      transform 0.1s ease;
  }

  .tile-action:focus,
  .tile-action:active {
    outline: none;
    box-shadow: none;
    background: none;
  }

  .tile-action:hover {
    color: var(--bs-primary);
    background: none;
    transform: scale(1.1);
  }

  /* Icon.vue may render an <i> (icon font) or an inline <svg> -
     cover both so sizing/color/centering are consistent. */
  .tile-action :deep(svg),
  .tile-action :deep(i) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    line-height: 1;
    fill: currentColor;
  }

  .tile-action :deep(i) {
    font-size: 16px;
    font-style: normal;
  }
</style>
