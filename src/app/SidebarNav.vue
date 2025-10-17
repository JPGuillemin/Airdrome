<template>
  <nav class="nav flex-column">
    <div class="sidebar-brand d-flex justify-content-between align-items-end">
      <button class="btn btn-link btn-lg p-0 m-0 d-md-none" @click="store.hideMenu">
        <Icon icon="x" />
      </button>
    </div>

    <router-link class="nav-link" :to="{name: 'home'}" :exact="true">
      <Icon icon="discover" class="" /> Discover
    </router-link>

    <router-link class="nav-link" :to="{name: 'queue'}">
      <Icon icon="soundwave" /> Playing
    </router-link>

    <small class="sidebar-heading text-muted">
      Library
    </small>

    <router-link class="nav-link" :to="{name: 'albums-default'}">
      <Icon icon="albums" /> Albums
    </router-link>

    <router-link class="nav-link" :to="{name: 'artists'}">
      <Icon icon="artists" /> Artists
    </router-link>

    <router-link class="nav-item nav-link" :to="{name: 'genres'}">
      <Icon icon="genres" /> Genres
    </router-link>

    <router-link class="nav-link" :to="{name: 'playlists'}">
      <Icon icon="list" /> Playlists
    </router-link>

    <router-link class="nav-link" :to="{name: 'favourites'}">
      <Icon icon="heart" /> Favourites
    </router-link>

    <router-link class="nav-link" :to="{name: 'files'}">
      <Icon icon="files" /> Files
    </router-link>

    <PlaylistNav />
  </nav>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import PlaylistNav from '@/library/playlist/PlaylistNav.vue'
  import { useMainStore } from '@/shared/store'

  export default defineComponent({
    components: {
      PlaylistNav,
    },
    setup() {
      return {
        store: useMainStore(),
      }
    },
  })
</script>
