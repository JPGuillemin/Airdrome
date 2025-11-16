<template>
  <td>
    <button>
      <Icon class="icon" :icon="active ? 'pause' : 'play'" />
      <span class="number adapt-text">{{ trackNumber ?? '-' }}</span>
    </button>
  </td>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import Icon from '@/shared/components/Icon.vue'

  export default defineComponent({
    name: 'CellTrackNumber',
    components: { Icon },
    props: {
      active: { type: Boolean, default: false },
      trackNumber: { type: [Number, String], default: null }
    }
  })
</script>
