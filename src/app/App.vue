// App.vue
<template>
  <div>
    <component :is="layout">
      <router-view v-slot="{ Component, route: viewRoute }">
        <component
          :is="Component"
          v-if="!viewRoute.meta.keepAlive"
          v-bind="routeOnAttributes(viewRoute)"
        />
        <keep-alive v-else max="5">
          <component
            :is="Component"
            v-bind="routeOnAttributes(viewRoute)"
          />
        </keep-alive>
      </router-view>
    </component>
    <GlobalLoader />
  </div>
</template>

<script setup>
  import { computed, onMounted, onUnmounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { App as CapacitorApp } from '@capacitor/app'

  import GlobalLoader from '@/shared/components/GlobalLoader.vue'
  import Default from '@/app/layout/Default.vue'
  import Fullscreen from '@/app/layout/Fullscreen.vue'
  import { reloadToken } from '@/shared/reload'
  import { isAndroid } from '@/shared/platform'

  var route = useRoute()
  var router = useRouter()
  var backListener = null

  /**
   * Build the key attributes used to force a view refresh.
   *
   * @param {Object} r - Current route.
   * @returns {Object} Key attributes for the routed component.
   */
  function routeOnAttributes(r) {
    var dynamicRoutes = new Set(['album', 'genre', 'artist', 'search', 'queue'])
    var key

    if (dynamicRoutes.has(r.name)) {
      key = JSON.stringify(r.params) + '-' + reloadToken.value
    } else {
      key = String(r.name) + '-' + reloadToken.value
    }

    return { key: key }
  }

  var layout = computed(function () {
    if (route.meta.layout === 'fullscreen') {
      return Fullscreen
    }

    return Default
  })

  onMounted(async function () {
    if (!isAndroid) {
      return
    }

    try {
      backListener = await CapacitorApp.addListener('backButton', function () {
        if (router.options.history.state.back) {
          router.back()
        } else {
          CapacitorApp.minimizeApp().catch(function() {
            // Nothing else to do if the host refuses to minimise.
          })
        }
      })
    } catch (error) {
      console.warn('Back button listener failed', error)
    }
  })

  onUnmounted(function () {
    if (backListener) {
      Promise.resolve(backListener.remove()).catch(function() {
        // Listener already gone.
      })
      backListener = null
    }
  })
</script>
