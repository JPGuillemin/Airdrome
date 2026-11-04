// TrackMenuItem.vue
<template>
  <li>
    <component
      :is="tagName"
      :type="buttonType"
      :href="linkHref"
      :disabled="disabled"
      :class="classes"
      v-bind="$attrs"
    >
      <slot />
      <Icon v-if="icon" :icon="icon" class="ms-4" />
    </component>
  </li>
</template>

<script setup>
  import { computed } from 'vue'

  defineOptions({ inheritAttrs: false })

  var props = defineProps({
    /** Icon name shown on the right side. */
    icon: { type: String, default: null },
    /** Optional Bootstrap variant suffix. */
    variant: { type: String, default: '' },
    /** Disable the item. */
    disabled: { type: Boolean, default: false },
    /** When set, render the item as a link. */
    href: { type: String, default: '' },
  })

  var isLink = computed(function () {
    return !!props.href
  })

  var classes = computed(function () {
    var result = [
      'dropdown-item d-flex justify-content-between align-items-center text-nowrap',
    ]

    if (props.variant) {
      result.push('dropdown-item-' + props.variant)
    }

    return result
  })

  /** Tag rendered by the dynamic component. */
  var tagName = computed(function () {
    if (isLink.value) {
      return 'a'
    }

    return 'button'
  })

  /** `type` attribute, only meaningful for buttons. */
  var buttonType = computed(function () {
    if (isLink.value) {
      return undefined
    }

    return 'button'
  })

  /** `href` attribute, only meaningful for links. */
  var linkHref = computed(function () {
    if (isLink.value) {
      return props.href
    }

    return undefined
  })
</script>

<style scoped>
  .dropdown-item-danger:not(:disabled) {
    color: var(--bs-danger);
  }

  .dropdown-item-danger:not(:disabled):hover,
  .dropdown-item-danger:not(:disabled):focus {
    color: var(--bs-primary);
  }

  .dropdown-item:not(:disabled):hover,
  .dropdown-item:not(:disabled):focus {
    background-color: $theme-elevation-2;
    color: var(--bs-primary);
  }
</style>
