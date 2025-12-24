<template>
  <Tiles :tile-size="tileSize" :allow-h-scroll="allowHScroll" :twin-rows="twinRows">
    <Tile
      v-for="(item, index) in validItems"
      :key="item.id || index"
      :to="{ name: 'album', params: { id: item.id } }"
      :title="item.name || 'Unknown Album'"
      :image="item.image || ''"
      draggable="true"
      :title-only="titleOnly"
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
      <template v-if="tileSize > 79" #context-menu>
        <DropdownItem icon="play" class="on-top" @click="playNow(item.id)">
          Play
        </DropdownItem>
        <DropdownItem :icon="isFavourite(item.id) ? 'heart-fill' : 'heart'" class="on-top" @click.stop="toggleFavourite(item.id)">
          Like
        </DropdownItem>
      </template>
    </Tile>
  </Tiles>
</template>

<script lang="ts">
  import { defineComponent, inject, computed } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlayerStore } from '@/player/store'
  import { useCacheStore } from '@/player/cache'
  import type { Album } from '@/shared/api'
  import { sleep } from '@/shared/utils'

  export default defineComponent({
    props: {
      items: {
        type: Array as () => Album[],
        required: true,
      },
      allowHScroll: { type: Boolean, default: false },
      tileSize: { type: Number, default: 100 },
      twinRows: { type: Boolean, default: false },
      titleOnly: { type: Boolean, default: false },
    },

    setup(props) {
      const favouriteStore = useFavouriteStore()
      const playerStore = usePlayerStore()
      const cacheStore = useCacheStore()
      const api = inject('$api') as any

      const validItems = computed(() => {
        return (props.items || []).filter((item): item is Album => !!item?.id)
      })

      const playNow = async(id: string) => {
        playerStore.setShuffle(false)
        const album = await api.getAlbumDetails(id)
        return playerStore.playTrackList(album.tracks!)
      }

      const toggleFavourite = async(id: string) => {
        favouriteStore.toggle('album', id)
        await sleep(300)
        const album = await api.getAlbumDetails(id)
        if (!album) return
        if (isFavourite(id)) {
          await cacheStore.cacheAlbum(album)
        } else {
          await cacheStore.clearAlbumCache(album)
        }
      }

      const dragstart = (id: string, event: DragEvent) => {
        event.dataTransfer?.setData('application/x-album-id', id)
      }

      const isFavourite = (id: string) => {
        return favouriteStore.get('album', id)
      }

      return {
        favouriteStore,
        playerStore,
        cacheStore,
        api,
        validItems,
        playNow,
        toggleFavourite,
        dragstart,
        isFavourite,
      }
    },
  })
</script>
