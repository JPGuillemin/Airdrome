<template>
  <a :href="href" @click.prevent="openLink" v-bind="$attrs">
    <slot />
  </a>
</template>

<script lang="ts">
	import { defineComponent } from 'vue'
	import { Browser } from '@capacitor/browser'
	import { Capacitor } from '@capacitor/core'

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
				const isNative = Capacitor.isNativePlatform()
				
				if (isNative) {
					await Browser.open({ url: props.href })
				} else {
					window.open(props.href, '_blank', 'noopener,noreferrer')
				}
			}

			return {
				openLink
			}
		}
	})
</script>