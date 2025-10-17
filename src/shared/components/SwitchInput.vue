<template>
  <div class="form-check form-switch">
    <input
      :id="id"
      type="checkbox" role="switch"
      class="form-check-input"
      :checked="modelValue"
      @change="$emit('update:model-value', $event.target.checked)"
    >
    <label :for="id" class="form-check-label" />
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import { uniqueId } from 'lodash-es'

  export default defineComponent({
    props: {
      modelValue: { type: Boolean, default: false },
    },
    emits: ['input', 'update:model-value'],
    computed: {
      id(): string {
        return uniqueId('switch-')
      }
    },
  })
</script>
