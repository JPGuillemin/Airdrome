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
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 50%;

    background-color: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 14px;
    line-height: 1;

    cursor: pointer;
    transition:
      background-color 0.15s ease,
      transform 0.1s ease;
  }

  .tile-action:hover {
    background-color: var(--bs-primary);
    transform: scale(1.1);
  }

  /* Icon.vue may render an <i> (icon font) or an inline <svg> -
     cover both so sizing/color inherit from the button. */
  .tile-action :deep(svg) {
    width: 14px;
    height: 14px;
    fill: currentColor;
  }
</style>
