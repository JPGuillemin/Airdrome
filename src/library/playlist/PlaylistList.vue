<template>
  <Tiles :tile-size="tileSize" :allow-h-scroll="allowHScroll">
    <Tile
      v-for="(item, index) in validItems"
      :key="item.id || index"
      :to="{ name: 'playlist', params: { id: item.id } }"
      :title="item.name || 'Untitled Playlist'"
      :image="item.image || ''"
      :circle="false"
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
        <DropdownItem icon="play" class="on-top" @click="playNow(item.id)">
          Play
        </DropdownItem>

        <DropdownItem
          v-if="isPlaylistView"
          icon="edit"
          class="on-top"
          @click="$emit('edit-playlist', item)"
        >
          Edit
        </DropdownItem>

        <DropdownItem
          v-if="isPlaylistView"
          icon="trash"
          class="on-top"
          @click.stop.prevent="$emit('remove-playlist', item.id)"
        >
          Remove
        </DropdownItem>
      </template>
    </Tile>
  </Tiles>
</template>

<script lang="ts">
  import { defineComponent, computed, inject } from 'vue'
  import { usePlayerStore } from '@/player/store'
  import type { Playlist } from '@/shared/api'
  import type { PropType } from 'vue'

  export default defineComponent({
    props: {
      items: {
        type: Array as PropType<Playlist[]>,
        required: true,
      },
      allowHScroll: { type: Boolean, default: false },
      isPlaylistView: { type: Boolean, default: false },
      tileSize: { type: Number, default: 100 },
    },

    setup(props) {
      const playerStore = usePlayerStore()
      const api = inject('$api') as any

      const validItems = computed(() =>
        (props.items || []).filter((item): item is Playlist => !!item?.id)
      )

      const playNow = async(id: string) => {
        playerStore.setShuffle(false)
        const playlist = await api.getPlaylist(id)
        return playerStore.playTrackList(playlist.tracks!)
      }

      return { playerStore, validItems, playNow }
    },
  })
</script>
