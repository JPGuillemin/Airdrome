<template>
  <a
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    v-bind="$attrs"
  >
    <slot />
  </a>
</template>

<script>
  import { defineComponent } from 'vue'

  export default defineComponent({
    name: 'ExternalLink',
    props: {
      /** Target URL, opened by the platform. */
      href: {
        type: String,
        required: true
      }
    }
  })
</script>
