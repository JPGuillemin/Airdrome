<template>
  <Tiles :allow-h-scroll="allowHScroll">
    <Tile
      v-for="(item, index) in validItems"
      :key="item.id || index"
      :to="{ name: 'playlist', params: { id: item.id } }"
      :title="item.name || 'Untitled Playlist'"
      :image="item.image || ''"
    >
      <template #title>
        <router-link :to="{ name: 'playlist', params: { id: item.id } }">
          {{ item.name }}
        </router-link>
      </template>

      <!-- Tracks info -->
      <template #text>
        <strong>{{ item.trackCount || 0 }}</strong> tracks
      </template>

      <!-- Context Menu -->
      <template #context-menu>
        <DropdownItem icon="play" @click="playNow(item.id)">
          Play
        </DropdownItem>
      </template>
    </Tile>
  </Tiles>
</template>

<script lang="ts">
  import { defineComponent, PropType } from 'vue'
  import { usePlayerStore } from '@/player/store'
  import type { Playlist } from '@/shared/api'

  export default defineComponent({
    props: {
      items: {
        type: Array as PropType<Playlist[]>,
        required: true,
      },
      allowHScroll: { type: Boolean, default: false },
    },

    setup() {
      return {
        playerStore: usePlayerStore(),
      }
    },

    computed: {
      validItems(): Playlist[] {
        return (this.items || []).filter((item): item is Playlist => !!item?.id)
      },
    },

    methods: {
      async playNow(id: string) {
        const playlist = await this.$api.getPlaylist(id)
        return this.playerStore.playTrackList(playlist.tracks!)
      },
    },
  })
</script>
