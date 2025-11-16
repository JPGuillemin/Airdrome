<template>
  <Tiles :allow-h-scroll="allowHScroll">
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
        <DropdownItem :icon="isFavourite(item.id) ? 'heart-fill' : 'heart'" @click.stop="toggleFavourite(item.id)">
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
    },
    setup() {
      return {
        favouriteStore: useFavouriteStore(),
      }
    },
    methods: {
      async toggleFavourite(id: string) {
        this.favouriteStore.toggle('artist', id)
      },
      isFavourite(id: string) {
        return this.favouriteStore.get('artist', id)
      },
    },
  })
</script>
