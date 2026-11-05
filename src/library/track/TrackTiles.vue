// TrackTiles.vue
<template>
  <Tiles :tile-size="tileSize" :allow-h-scroll="allowHScroll" :twin-rows="twinRows">
    <template v-for="(item, index) in validItems" :key="item.id || index">
      <Tile
        :title="item.title || 'Unknown Track'"
        :image="item.image || ''"
        draggable="true"
        :title-only="titleOnly"
        @dragstart="dragstart(item, $event)"
        @click="playNow(index)"
        @contextmenu.prevent="rowMenu.onContextMenu(rowKey(item, index), $event)"
        @mousedown="rowMenu.onMouseDown(rowKey(item, index), $event)"
        @mousemove="rowMenu.onMouseMove"
        @mouseup="rowMenu.onMouseUp"
        @mouseleave="rowMenu.onMouseUp"
        @touchstart="rowMenu.onTouchStart(rowKey(item, index), $event)"
        @touchend="rowMenu.onTouchEnd"
        @touchmove="rowMenu.onTouchMove"
      >
        <!-- Artists and Album -->
        <template #text>
          <!-- Artists -->
          <template v-if="withArtist">
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
          <!-- Album -->
          <span v-if="withAlbum && item.album" class="text-muted">
            <span v-if="withArtist && item.artists && item.artists.length"> • </span>
            {{ item.album }}
          </span>
        </template>
        <!-- Hover Actions -->
        <template v-if="tileSize > 79" #actions>
          <TileActionButton icon="queue-next" label="Play next" @click.stop="playNext(item)" />
          <TileActionButton icon="queue" label="Add to queue" @click.stop="addToQueue(item)" />
          <TileActionButton
            :icon="favouriteIcon(item.id)"
            label="Like"
            @click.stop="toggleFavourite(item.id)"
          />
        </template>
      </Tile>

      <!-- Tile has no default slot, so the (teleported) menu is mounted as a sibling. -->
      <RowActionsMenu
        :ref="rowMenu.menuRefFor(rowKey(item, index))"
        :track="item"
      />
    </template>
  </Tiles>
</template>

<script>
  import { defineComponent, computed } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlayerStore } from '@/player/store'
  import { useCacheStore } from '@/shared/cache'
  import { useRowMenu } from '@/shared/useRowMenu'
  import RowActionsMenu from '@/library/track/RowActionsMenu.vue'

  export default defineComponent({
    components: { RowActionsMenu: RowActionsMenu },
    props: {
      /** Tracks displayed as tiles. */
      items: {
        type: Array,
        required: true,
      },
      allowHScroll: { type: Boolean, default: false },
      tileSize: { type: Number, default: 105 },
      twinRows: { type: Boolean, default: false },
      titleOnly: { type: Boolean, default: false },
      withArtist: { type: Boolean, default: true },
      withAlbum: { type: Boolean, default: false },
    },
    emits: ['favourite-added'],
    setup: function (props, context) {
      var emit = context.emit
      var favouriteStore = useFavouriteStore()
      var playerStore = usePlayerStore()
      var cacheStore = useCacheStore()
      var rowMenu = useRowMenu()

      var validItems = computed(function () {
        return (props.items || []).filter(function (item) {
          return !!item && !!item.id
        })
      })

      /** Row key: the track id, falling back to the list index. */
      function rowKey(item, index) {
        if (item.id === null || item.id === undefined) {
          return index
        }

        return item.id
      }

      // Append only the clicked track to the end of the existing queue,
      // then jump to it. Keeps the queue state intact and the playing track
      // correctly highlighted in the queue view.
      function playNow(index) {
        if (rowMenu.consumeSuppressedClick()) {
          return
        }

        var track = validItems.value[index]

        if (!track) {
          return
        }

        if (track.url) {
          cacheStore.cacheTrack(track.url)
        }

        playerStore.setShuffle(false)

        var insertIndex = playerStore.queue.length
        playerStore.addToQueue([track])

        return playerStore.playTrackListIndex(insertIndex)
      }

      async function toggleFavourite(id) {
        var track = null

        for (var i = 0; i < validItems.value.length; i++) {
          if (validItems.value[i].id === id) {
            track = validItems.value[i]
            break
          }
        }

        if (!track) {
          return
        }

        await favouriteStore.toggle('track', id)

        if (isFavourite(id)) {
          if (track.url) {
            await cacheStore.cacheTrack(track.url)
          }

          emit('favourite-added', track)
        } else {
          if (track.url) {
            await cacheStore.deleteTrack(track.url)
          }
        }
      }

      function playNext(track) {
        playerStore.setNextInQueue([track])
      }

      function addToQueue(track) {
        playerStore.addToQueue([track])
      }

      function dragstart(item, event) {
        rowMenu.onMouseUp()

        if (!item.isStream && event.dataTransfer) {
          event.dataTransfer.setData('application/x-track-id', item.id)
        }
      }

      function isFavourite(id) {
        return favouriteStore.get('track', id)
      }

      function favouriteIcon(id) {
        if (isFavourite(id)) {
          return 'heart-fill'
        }

        return 'heart'
      }

      // Row menu (right click / long press) is handled by useRowMenu.
      return {
        rowMenu: rowMenu,
        validItems: validItems,
        rowKey: rowKey,
        playNow: playNow,
        playNext: playNext,
        addToQueue: addToQueue,
        toggleFavourite: toggleFavourite,
        dragstart: dragstart,
        isFavourite: isFavourite,
        favouriteIcon: favouriteIcon,
      }
    },
  })
</script>
