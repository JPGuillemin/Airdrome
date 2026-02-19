<template>
  <nav class="mobile-nav d-md-none">
    <button
      v-for="item in items"
      :key="item.name"
      class="mobile-nav-item btn btn-link p-0"
      :class="{ active: isActive(item) }"
      :title="item.title"
      v-longpress-tooltip
      @click="go(item)"
      type="button"
    >
      <Icon :icon="item.icon" />
    </button>
  </nav>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { longPressTooltip } from '@/shared/tooltips'

  export default defineComponent({
    name: 'MobileNavBar',

    directives: {
      'longpress-tooltip': longPressTooltip,
    },

    setup() {
      const router = useRouter()
      const route = useRoute()

      const items = [
        {
          name: 'discover',
          title: 'Discover',
          icon: 'discover',
          to: { name: 'discover' },
        },
        {
          name: 'queue',
          title: 'Playing',
          icon: 'soundwave',
          to: { name: 'queue' },
        },
        {
          name: 'genres',
          title: 'Genres',
          icon: 'genres',
          to: { name: 'genres' },
        },
        {
          name: 'playlists',
          title: 'Playlists',
          icon: 'playlist',
          to: { name: 'playlists' },
        },
        {
          name: 'favourites',
          title: 'Favourites',
          icon: 'heart',
          to: { name: 'favourites' },
        },
      ]

      const go = (item: any) => {
        router.push(item.to)
      }

      const isActive = (item: any) => {
        if (item.match) {
          return item.match(route)
        }
        return route.name === item.to.name
      }

      return {
        items,
        go,
        isActive,
      }
    },
  })
</script>

<style scoped>
  .mobile-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;

    height: var(--mobile-nav-height);
    background-color: var(--bs-body-bg);

    display: flex;
    justify-content: space-around;
    align-items: center;

    z-index: 3000;
  }

  .mobile-nav-item {
    flex: 1;
    text-align: center;
    color: var(--bs-secondary);
    font-size: 1.3rem;
  }

  .mobile-nav-item.active {
    color: var(--bs-primary);
  }
</style>
