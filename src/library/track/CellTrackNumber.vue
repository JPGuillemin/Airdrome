// CellTrackNumber.vue
<template>
  <td>
    <button>
      <Icon class="icon" icon="spin" :class="{ 'visually-hidden': !active }" />
      <Icon class="icon" icon="play" :class="{ 'visually-hidden': active }" />
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

<style scoped>
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
</style>
