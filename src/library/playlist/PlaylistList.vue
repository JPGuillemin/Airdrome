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
        <!-- Play -->
        <DropdownItem icon="play" @click="playNow(item.id)">
          Play
        </DropdownItem>

        <DropdownItem
          v-if="isPlaylistView"
          icon="edit"
          @click="$emit('edit-playlist', item)"
        >
          Edit
        </DropdownItem>

        <DropdownItem
          v-if="isPlaylistView"
          icon="trash"
          @click="$emit('remove-playlist', item.id)"
        >
          Remove
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
      isPlaylistView: { type: Boolean, default: false },
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
      removePlaylist(id: string) {
        if (!confirm('Are you sure you want to delete this playlist?')) return
        this.$emit('remove-playlist', id)
      },
    },
  })
</script>
