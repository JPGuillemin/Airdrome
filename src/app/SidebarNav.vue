<template>
  <nav class="nav flex-column">
    <div class="sidebar-brand d-flex justify-content-between align-items-end">
      <button class="btn btn-transparent p-0 m-0 d-md-none" @click="store.hideMenu">
        <Avatar>
          <Icon icon="x" />
        </Avatar>
      </button>
    </div>
    <router-link class="nav-link" :to="{ name: 'home' }" exact>
      <Icon icon="home" /> Discover
    </router-link>

    <router-link class="nav-link" :to="{name: 'queue'}">
      <Icon icon="soundwave" /> Playing
    </router-link>

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
      <Icon icon="playlist" /> Playlists
    </router-link>

    <router-link class="nav-link" :to="{name: 'favourites'}">
      <Icon icon="heart" /> Favourites
    </router-link>

    <router-link class="nav-link" :to="{name: 'podcasts'}">
      <Icon icon="podcast" /> Podcasts
    </router-link>

    <router-link class="nav-link" :to="{name: 'radio'}">
      <Icon icon="radio" /> Radio
    </router-link>

    <router-link class="nav-link" :to="{name: 'files'}">
      <Icon icon="files" /> Files
    </router-link>
  </nav>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import { useMainStore } from '@/shared/store'

  export default defineComponent({
    setup() {
      return {
        store: useMainStore(),
      }
    },
  })
</script>
