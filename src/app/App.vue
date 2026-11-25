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
  import { computed } from 'vue'
  import { useRoute } from 'vue-router'

  import GlobalLoader from '@/shared/components/GlobalLoader.vue'
  import Default from '@/app/layout/Default.vue'
  import Fullscreen from '@/app/layout/Fullscreen.vue'
  import { reloadToken } from '@/shared/reload'

  var route = useRoute()

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
</script>
