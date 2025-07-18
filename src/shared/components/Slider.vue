<template>
  <VueSlider
    v-bind="$attrs"
    :value="value"
    :min="min"
    :max="max"
    :interval="step"
    :tooltip-formatter="formatter"
    @change="onInput"
  />
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import VueSlider from 'vue-slider-component'

  export default defineComponent({
    components: {
      VueSlider,
    },
    props: {
      value: { type: Number, required: true },
      min: { type: Number, required: true },
      max: { type: Number, required: true },
      step: { type: Number, required: true },
      percent: { type: Boolean, default: false },
    },
    methods: {
      onInput(value: number) {
        this.$emit('input', value)
      },
      formatter(value: number) {
        return this.percent
          ? `${Math.round(((value - this.min) * 100) / (this.max - this.min))}%`
          : `${value}`
      }
    }
  })
</script>
<style scoped>
  .vue-slider {
    cursor: pointer;

    &:deep(.vue-slider-rail) {
      background-color: var(--bs-secondary);
      border-radius: 0;
    }
    &:deep(.vue-slider-process) {
      background-color: var(--bs-primary);
      border-radius: 0;
    }
    &:deep(.vue-slider-dot-handle) {
      background-color: var(--bs-primary);
    }
    &:deep(.vue-slider-dot-handle::after) {
      background-color: var(--bs-primary);
      opacity: 0.32;
      transform: translate(-50%, -50%) scale(1);
    }
    &:deep(.vue-slider-dot-handle:hover .vue-slider-dot-tooltip) {
      visibility: visible;
    }
    &:deep(.vue-slider-dot-tooltip-inner) {
      background-color: var(--bs-primary);
      border-color: var(--bs-primary);
    }
    &:deep(.vue-slider-dot-tooltip-text) {
      width: 44px;
      height: 44px;
      font-size: inherit;
    }
  }
</style>
