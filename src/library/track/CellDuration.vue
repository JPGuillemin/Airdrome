// CellDuration.vue
<template>
  <td class="text-start d-md-table-cell">
    {{ formattedDuration }}
  </td>
</template>

<script>
  import { defineComponent, computed } from 'vue'

  export default defineComponent({
    props: {
      /** Track whose duration is formatted. */
      track: { type: Object, required: true }
    },
    setup: function (props) {
      var formattedDuration = computed(function () {
        var d = 0

        if (props.track && props.track.duration !== null && props.track.duration !== undefined) {
          d = props.track.duration
        }

        if (!d) {
          return '-'
        }

        var min = Math.floor(d / 60)
        var sec = d % 60
        var secText = String(sec)

        if (secText.length < 2) {
          secText = '0' + secText
        }

        return min + ':' + secText
      })

      return { formattedDuration: formattedDuration }
    }
  })
</script>
