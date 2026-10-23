// PlaylistList.vue
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

      <!-- Hover Actions -->
      <template v-if="tileSize > 79" #actions>
        <TileActionButton
          icon="play"
          label="Play"
          @click.stop="playNow(item.id)"
        />
        
        <TileActionButton
          v-if="!isPlaylistView"
          icon="random"
          label="Shuffle"
          @click.stop="shuffleNow(item.id)"
        />
        
        <TileActionButton
          v-if="isPlaylistView"
          icon="edit"
          label="Edit"
          @click.stop="$emit('edit-playlist', item)"
        />

        <TileActionButton
          v-if="isPlaylistView"
          icon="trash"
          label="Remove"
          @click.stop.prevent="$emit('remove-playlist', item.id)"
        />
      </template>
    </Tile>
  </Tiles>
</template>

<script lang="ts">
  import { defineComponent, computed, inject } from 'vue'
  import { usePlayerStore } from '@/player/store'
  import { useRadioStore } from '@/player/radio'
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
      tileSize: { type: Number, default: 140 },
    },

    setup(props) {
      const playerStore = usePlayerStore()
      const radioStore = useRadioStore()
      const api = inject('$api') as any
      const validItems = computed(() =>
        (props.items || []).filter((item): item is Playlist => !!item?.id)
      )

      const playNow = async(id: string) => {
        playerStore.setShuffle(false)
        const playlist = await api.getPlaylist(id)
        return playerStore.playTrackList(playlist.tracks!)
      }


      const shuffleNow = async(id: string) => {
        const playlist = await api.getPlaylist(id)
        if (!playlist?.tracks?.length) return
        await radioStore.playRandomOrTracks({ tracks: playlist.tracks })
      }

      return { playerStore, radioStore, validItems, playNow, shuffleNow }
    },
  })
</script>