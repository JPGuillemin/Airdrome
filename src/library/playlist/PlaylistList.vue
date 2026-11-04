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

<script>
  import { defineComponent, computed, inject } from 'vue'
  import { usePlayerStore } from '@/player/store'
  import { useRadioStore } from '@/player/radio'

  export default defineComponent({
    props: {
      /** Playlist items displayed by the list. */
      items: {
        type: Array,
        required: true,
      },
      /** Whether the tiles can scroll horizontally. */
      allowHScroll: { type: Boolean, default: false },
      /** True when the list is shown on the playlists page. */
      isPlaylistView: { type: Boolean, default: false },
      /** Tile size in pixels. */
      tileSize: { type: Number, default: 140 },
    },

    setup: function (props) {
      var playerStore = usePlayerStore()
      var radioStore = useRadioStore()
      var api = inject('$api')

      /** Items that have a valid id (empty or partial entries are skipped). */
      var validItems = computed(function () {
        var list = props.items || []

        return list.filter(function (item) {
          return !!(item && item.id)
        })
      })

      async function playNow(id) {
        playerStore.setShuffle(false)

        var playlist = await api.getPlaylist(id)

        return await playerStore.playTrackList(playlist.tracks)
      }

      async function shuffleNow(id) {
        var playlist = await api.getPlaylist(id)

        if (!playlist || !playlist.tracks || !playlist.tracks.length) {
          return
        }

        await radioStore.playRandomOrTracks({ tracks: playlist.tracks })
      }

      return {
        playerStore: playerStore,
        radioStore: radioStore,
        validItems: validItems,
        playNow: playNow,
        shuffleNow: shuffleNow,
      }
    },
  })
</script>