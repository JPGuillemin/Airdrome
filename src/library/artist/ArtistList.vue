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
      <template #context-menu>
        <DropdownItem :icon="isFavourite(item.id) ? 'heart-fill' : 'heart'" class="on-top" @click.stop="toggleFavourite(item.id)">
          Like
        </DropdownItem>
      </template>
    </Tile>
  </Tiles>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'

  export default defineComponent({
    props: {
      items: { type: Array, required: true },
      allowHScroll: { type: Boolean, default: false },
      tileSize: { type: Number, default: 110 },
    },
    setup() {
      const favouriteStore = useFavouriteStore()

      const toggleFavourite = async(id: string) => {
        favouriteStore.toggle('artist', id)
      }

      const isFavourite = (id: string) => favouriteStore.get('artist', id)

      return {
        favouriteStore,
        toggleFavourite,
        isFavourite,
      }
    },
  })
</script>
