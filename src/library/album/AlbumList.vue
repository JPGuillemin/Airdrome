<template>
  <Tiles square :allow-h-scroll="allowHScroll">
    <Tile
      v-for="(item, index) in validItems"
      :key="item.id || index"
      :to="{ name: 'album', params: { id: item.id } }"
      :title="item.name || 'Unknown Album'"
      :image="item.image || ''"
      draggable="true"
      @dragstart="dragstart(item.id, $event)"
    >
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
        <DropdownItem :icon="isFavourite(item.id) ? 'heart-fill' : 'heart'" @click.stop="toggleFavourite(item.id)">
          Like
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
  import { useCacheStore } from '@/player/cache'
  import { sleep } from '@/shared/utils'

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
        cacheStore: useCacheStore(),
      }
    },

    computed: {
      validItems(): Album[] {
        return (this.items || []).filter((item): item is Album => !!item?.id)
      },
    },

    methods: {
      async playNow(id: string) {
        const album = await this.$api.getAlbumDetails(id)
        return this.playerStore.playTrackList(album.tracks!)
      },
      async toggleFavourite(id: string) {
        this.favouriteStore.toggle('album', id)
        await sleep(300)
        const album = await this.$api.getAlbumDetails(id)
        if (!album) return
        if (this.isFavourite(id)) {
          await this.cacheStore.cacheAlbum(album)
        } else {
          await this.cacheStore.clearAlbumCache(album)
        }
      },
      dragstart(id: string, event: DragEvent) {
        event.dataTransfer?.setData('application/x-album-id', id)
      },
      isFavourite(id: string) {
        return this.favouriteStore.get('album', id)
      },
    },
  })
</script>
