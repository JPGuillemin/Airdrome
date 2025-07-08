<template>
  <Tiles square :allow-h-scroll="allowHScroll">
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
  import { defineComponent } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'

  export default defineComponent({
    props: {
      items: { type: Array, required: true },
      allowHScroll: { type: Boolean, default: false },
    },
    setup() {
      return {
        favouriteStore: useFavouriteStore(),
      }
    },
    computed: {
      favourites(): any {
        return this.favouriteStore.artists
      },
    },
    methods: {
      toggleFavourite(id: string) {
        return this.favouriteStore.toggle('artist', id)
      },
    }
  })
</script>
<style lang="scss" scoped>
  .circle-tile img {
    border-radius: 50%;
    width: 100px;   /* Adjust as needed */
    height: 100px;  /* Ensure it matches width */
    object-fit: cover;
  }
</style>
