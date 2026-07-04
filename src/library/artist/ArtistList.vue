// ArtistList.vue
<template>
  <Tiles :tile-size="tileSize" :allow-h-scroll="allowHScroll">
    <Tile
      v-for="item in items" :key="item.id"
      :to="{name: 'artist', params: { id: item.id } }"
      :title="item.name"
      :image="item.image"
      :circle="true"
    >
      <template #text>
        <strong>{{ item.albumCount }}</strong> albums
      </template>
      <template v-if="tileSize > 79" #actions>
        <TileActionButton icon="random" label="Artist Shuffle" @click.stop="shuffleNow(item.id)" />
        <TileActionButton
          :icon="isFavourite(item.id) ? 'heart-fill' : 'heart'"
          label="Like"
          @click.stop="toggleFavourite(item.id)"
        />
      </template>
    </Tile>
  </Tiles>
</template>
<script lang="ts">
  import { defineComponent, inject } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { useRadioStore } from '@/player/radio'

  export default defineComponent({
    props: {
      items: { type: Array, required: true },
      allowHScroll: { type: Boolean, default: false },
      tileSize: { type: Number, default: 105 },
    },
    setup() {
      const favouriteStore = useFavouriteStore()
      const radioStore = useRadioStore()

      const toggleFavourite = async(id: string) => {
        await favouriteStore.toggle('artist', id)
      }

      const isFavourite = (id: string) => favouriteStore.get('artist', id)

      const shuffleNow = (id: string) => radioStore.shuffleArtist(id)

      return {
        favouriteStore,
        radioStore,
        toggleFavourite,
        isFavourite,
        shuffleNow,
      }
    },
  })
</script>
