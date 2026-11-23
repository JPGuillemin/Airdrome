<template>
  <a
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    v-bind="$attrs"
    @click="openLink"
  >
    <slot />
  </a>
</template>

<script>
  import { defineComponent } from 'vue'
  import { Browser } from '@capacitor/browser'
  import { isAndroid } from '@/shared/platform'

  export default defineComponent({
    name: 'ExternalLink',
    props: {
      /** Target URL, opened by the platform. */
      href: {
        type: String,
        required: true
      }
    },
    setup: function (props) {
      /**
       * Open external links in the system browser / Custom Tab on Android.
       * On the web the anchor's normal target="_blank" behaviour is kept.
       *
       * @param {MouseEvent} event
       * @returns {Promise<void>}
       */
      async function openLink(event) {
        if (!isAndroid) {
          return
        }

        event.preventDefault()

        try {
          await Browser.open({
            url: props.href,
            windowName: '_system'
          })
        } catch (error) {
          console.warn('Could not open external link', error)
        }
      }

      return {
        openLink: openLink
      }
    }
  })
</script>
