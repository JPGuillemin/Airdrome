<template>
  <a :href="href" @click.prevent="openLink" v-bind="$attrs">
    <slot />
  </a>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  export default defineComponent({
    name: 'ExternalLink',
    props: {
      href: {
        type: String,
        required: true
      }
    },
    setup(props) {
      const openLink = async () => {
        window.open(props.href, '_blank', 'noopener,noreferrer')
      }
      return {
        openLink
      }
    }
  })
</script>
