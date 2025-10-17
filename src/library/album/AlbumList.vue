<template>
  <Tiles square :allow-h-scroll="allowHScroll">
    <Tile
      v-for="(item, index) in items"
      :key="item.id || index"
      :to="{ name: 'album', params: { id: item.id } }"
      :title="item.name || 'Unknown Album'"
      :image="item.image || ''"
      draggable="true"
      @dragstart="dragstart(item.id, $event)"
    >
      <!-- Debugging -->
      <template #title>
        <router-link :to="{ name: 'album', params: { id: item.id } }">
          {{ item.name }}
        </router-link>
      </template>

      <!-- Artists -->
      <template #text>
        <span v-for="(artist, aIndex) in item.artists" :key="artist.id">
          <span v-if="aIndex > 0" class="text-muted">, </span>
          <router-link
            :to="{ name: 'artist', params: { id: artist.id } }"
            class="text-muted"
          >
            {{ artist.name }}
          </router-link>
        </span>
      </template>

      <!-- Context Menu -->
      <template #context-menu>
        <DropdownItem icon="play" @click="playNow(item.id)">
          Play
        </DropdownItem>
        <DropdownItem icon="plus" @click="playNext(item.id)">
          Play next
        </DropdownItem>
        <DropdownItem icon="plus" @click="playLater(item.id)">
          Add to queue
        </DropdownItem>
        <DropdownItem
          :icon="favourites[item.id] ? 'heart-fill' : 'heart'"
          @click="toggleFavourite(item.id)"
        >
          Favourite
        </DropdownItem>
      </template>
    </Tile>
  </Tiles>
</template>

<script lang="ts">
  import { defineComponent, PropType } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlayerStore } from '@/player/store'
  import type { Album } from '@/shared/api'

  export default defineComponent({
    props: {
      items: {
        type: Array as PropType<Album[]>,
        required: true,
      },
      allowHScroll: { type: Boolean, default: false },
    },

    setup() {
      return {
        favouriteStore: useFavouriteStore(),
        playerStore: usePlayerStore(),
      }
    },

    computed: {
      validItems(): Album[] {
        return (this.items || []).filter((item): item is Album => !!item?.id)
      },

      favourites(): any {
        return this.favouriteStore.albums
      },
    },

    methods: {
      async playNow(id: string) {
        const album = await this.$api.getAlbumDetails(id)
        return this.playerStore.playTrackList(album.tracks!)
      },
      async playNext(id: string) {
        const album = await this.$api.getAlbumDetails(id)
        return this.playerStore.setNextInQueue(album.tracks!)
      },
      async playLater(id: string) {
        const album = await this.$api.getAlbumDetails(id)
        return this.playerStore.addToQueue(album.tracks!)
      },
      toggleFavourite(id: string) {
        return this.favouriteStore.toggle('album', id)
      },
      dragstart(id: string, event: DragEvent) {
        event.dataTransfer?.setData('application/x-album-id', id)
      },
    },
  })
</script>
