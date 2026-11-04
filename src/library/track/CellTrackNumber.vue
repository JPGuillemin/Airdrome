// CellTrackNumber.vue
<template>
  <td>
    <button>
      <Icon class="icon" icon="spin" :class="{ 'visually-hidden': !active }" />
      <Icon class="icon" icon="play" :class="{ 'visually-hidden': active }" />
      <span class="number adapt-text">{{ displayNumber }}</span>
    </button>
  </td>
</template>

<script>
  import { defineComponent, computed } from 'vue'
  import Icon from '@/shared/components/Icon.vue'

  export default defineComponent({
    name: 'CellTrackNumber',
    components: { Icon: Icon },
    props: {
      /** Whether the track is the one currently playing. */
      active: { type: Boolean, default: false },
      /** Track number shown in the cell (null renders a dash). */
      trackNumber: { type: [Number, String], default: null }
    },
    setup: function (props) {
      var displayNumber = computed(function () {
        if (props.trackNumber === null || props.trackNumber === undefined) {
          return '-'
        }

        return props.trackNumber
      })

      return { displayNumber: displayNumber }
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
