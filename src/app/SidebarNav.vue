<template>
  <nav class="nav adapt-text flex-column">
    <div class="sidebar-brand d-flex justify-content-between align-items-end">
      <button class="btn btn-link btn-lg p-0 m-0 d-md-none" @click="store.hideMenu">
        <Icon icon="goback" />
      </button>
    </div>

    <router-link
      :to="{name: 'discover'}"
      class="nav-link"
    >
      <Icon icon="discover" class="me-2" />
      <span class="bold">Cockpit</span>
    </router-link>

    <router-link
      :to="{name: 'queue'}"
      class="nav-link mt-2"
      :class="{ 'router-link-active': route.fullPath.includes('/queue') }"
    >
      <Icon icon="soundwave" class="me-2" />
      <span class="bold">Playing</span>
    </router-link>

    <router-link
      :to="{ name: 'albums-default' }"
      class="nav-link mt-5"
      :class="{ 'router-link-active': route.fullPath.includes('/albums/') }"
    >
      <Icon icon="albums" class="me-2" />
      <span class="bold">Albums</span>
    </router-link>

    <router-link
      :to="{name: 'artists', params: { sort: 'default' }}"
      class="nav-link mt-2"
      :class="{ 'router-link-active': route.fullPath.includes('/artists/') }"
    >
      <Icon icon="artists" class="me-2" />
      <span class="bold">Artists</span>
    </router-link>

    <router-link
      :to="{name: 'genres', params: { sort: 'default' }}"
      class="nav-link mt-2"
      :class="{ 'router-link-active': route.fullPath.includes('/genres/') }"
    >
      <Icon icon="genres" class="me-2" />
      <span class="bold">Genres</span>
    </router-link>

    <router-link
      :to="{name: 'playlists', params: { sort: 'default' }}"
      class="nav-link mt-2"
      :class="{ 'router-link-active': route.fullPath.includes('/playlist') }"
    >
      <Icon icon="playlist" class="me-2" />
      <span class="bold">Playlists</span>
    </router-link>

    <router-link
      :to="{name: 'favourites', params: { section: 'albums' }}"
      class="nav-link mt-2"
      :class="{ 'router-link-active': route.fullPath.includes('/favourites/') }"
    >
      <Icon icon="heart" class="me-2" />
      <span class="bold">Favourites</span>
    </router-link>
  </nav>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { useMainStore } from '@/shared/store'
  import { useRoute } from 'vue-router'

  export default defineComponent({
    setup() {
      const store = useMainStore()
      const route = useRoute()

      return {
        store,
        route,
      }
    },
  })
</script>
