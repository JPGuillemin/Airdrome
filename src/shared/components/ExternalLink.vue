<template>
  <a :href="href" @click.prevent="openLink" v-bind="$attrs">
    <slot />
  </a>
</template>
<script>
  import { defineComponent } from 'vue'

  export default defineComponent({
    name: 'ExternalLink',
    props: {
      /** Target URL, opened in a new tab. */
      href: {
        type: String,
        required: true
      }
    },
    setup: function (props) {
      async function openLink() {
        window.open(props.href, '_blank', 'noopener,noreferrer')
      }

      return {
        openLink: openLink
      }
    }
  })
</script>
