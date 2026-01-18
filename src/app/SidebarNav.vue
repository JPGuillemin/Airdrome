<template>
  <nav class="nav flex-column">
    <div class="sidebar-brand d-flex justify-content-between align-items-end">
      <button class="btn btn-link btn-lg p-0 m-0 d-md-none" @click="store.hideMenu">
        <Icon icon="goback" />
      </button>
    </div>

    <router-link class="nav-link" :to="{name: 'home'}">
      <Icon icon="discover" class="" /> Discover
    </router-link>

    <router-link class="nav-link" :to="{name: 'queue'}">
      <Icon icon="soundwave" /> Playing
    </router-link>

    <small class="sidebar-heading text-muted">
      Library
    </small>

    <router-link
      class="nav-link"
      :to="{ name: 'albums-default' }"
      :class="{ 'router-link-active': route.fullPath.includes('/albums/') }"
    >
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

    <router-link
      class="nav-link"
      to="{name: 'queue'}"
      :class="{ 'router-link-active': radioPressed }"
      @mousedown.prevent="radioPressed = true"
      @mouseup.prevent="radioPressed = false"
      @mouseleave.prevent="radioPressed = false"
      @touchstart.prevent="radioPressed = true"
      @touchend.prevent="radioPressed = false"
      @click="luckyRadioNow"
    >
      <Icon icon="radio" /> Radio
    </router-link>
  </nav>
</template>

<script lang="ts">
  import { defineComponent, inject } from 'vue'
  import { useMainStore } from '@/shared/store'
  import { useRoute } from 'vue-router'
  import { useRadioStore } from '@/player/radio'

  export default defineComponent({
    setup() {
      const store = useMainStore()
      const route = useRoute()
      const api = inject('$api') as any
      const radioStore = useRadioStore()
      const radioPressed = false
      const luckyRadioNow = async() => {
        if (!api) return
        await radioStore.luckyRadio(api)
      }

      return {
        store,
        route,
        luckyRadioNow,
        radioPressed,
      }
    },
  })
</script>
