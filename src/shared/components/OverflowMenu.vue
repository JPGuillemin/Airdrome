<template>
  <Dropdown
    align="end"
    menu-append-to-body
    :direction="direction"
    :variant="variant"
    class="p-0"
    :toggle-class="p-0"
    :disabled="disabled"
  >
    <template #button-content>
      <Icon icon="three-dots-vertical" />
    </template>
    <slot class="on-top" />
  </Dropdown>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'

  export default defineComponent({
    props: {
      disabled: { type: Boolean, default: false },
      variant: { type: String, default: 'link' },
      direction: { type: String, default: 'up' },
    }
  })
</script>
