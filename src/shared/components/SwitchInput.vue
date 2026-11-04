// SwitchInput.vue
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
<script>
  import { defineComponent } from 'vue'
  import { uniqueId } from 'lodash-es'

  export default defineComponent({
    props: {
      /** Current switch value. */
      modelValue: { type: Boolean, default: false },
    },
    emits: ['input', 'update:model-value'],
    computed: {
      id: function () {
        return uniqueId('switch-')
      }
    },
  })
</script>
