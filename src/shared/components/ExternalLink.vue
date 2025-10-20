<template>
  <a :href="href" target="_blank" rel="noopener noreferrer" :class="[className]" v-bind="$attrs">
    <slot />
  </a>
</template>

<script>
  export default {
    name: 'ExternalLink',
    props: {
      href: { type: String, required: true }
    }
  }
</script>
