<template>
  <li>
    <component
      :is="isLink ? 'a' : 'button'"
      :type="isLink ? undefined : 'button'"
      :href="isLink ? href : undefined"
      :disabled="disabled"
      :class="classes"
      v-bind="$attrs"
    >
      <slot />
      <Icon v-if="icon" :icon="icon" class="ms-4" />
    </component>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'

  const props = defineProps({
    icon: { type: String, default: null },
    variant: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    href: { type: String, default: '' },
  })

  const classes = computed(() => [
    'dropdown-item d-flex justify-content-between align-items-center text-nowrap',
    props.variant && `dropdown-item-${props.variant}`,
  ])

  const isLink = computed(() => !!props.href)
</script>

<style>
  .dropdown-item-danger:not(:disabled) {
    color: var(--bs-danger);
  }
</style>
