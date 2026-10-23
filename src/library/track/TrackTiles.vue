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
        @contextmenu.prevent="openMenu(item.id ?? index)"
        @mousedown="onMouseDown(item.id ?? index, $event)"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
        @touchstart="onTouchStart(item.id ?? index, $event)"
        @touchend="onTouchEnd"
        @touchmove="onTouchEnd"
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
            <span v-if="withArtist && item.artists?.length"> • </span>
            {{ item.album }}
          </span>
        </template>
        <!-- Hover Actions -->
        <template v-if="tileSize > 79" #actions>
          <TileActionButton icon="queue-next" label="Play next" @click.stop="playNext(item)" />
          <TileActionButton icon="queue" label="Add to queue" @click.stop="addToQueue(item)" />
          <TileActionButton
            :icon="isFavourite(item.id) ? 'heart-fill' : 'heart'"
            label="Like"
            @click.stop="toggleFavourite(item.id)"
          />
        </template>
      </Tile>

      <!-- Tile has no default slot, so the (teleported) menu is mounted as a sibling. -->
      <RowActionsMenu
        :ref="(el) => setMenuRef(el, item.id ?? index)"
        :track="item"
      />
    </template>
  </Tiles>
</template>

<script lang="ts">
  import { defineComponent, computed } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlayerStore } from '@/player/store'
  import { useCacheStore } from '@/shared/cache'
  import type { Track } from '@/shared/api'
  import { sleep } from '@/shared/utils'
  import RowActionsMenu from '@/library/track/RowActionsMenu.vue'

  const LONG_PRESS_MS = 500
  // Pixels the mouse may drift during a long press before it is cancelled
  const MOUSE_MOVE_TOLERANCE = 5

  export default defineComponent({
    components: { RowActionsMenu },
    props: {
      items: {
        type: Array as () => Track[],
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
    setup(props, { emit }) {
      const favouriteStore = useFavouriteStore()
      const playerStore = usePlayerStore()
      const cacheStore = useCacheStore()

      const validItems = computed(() =>
        (props.items || []).filter((item): item is Track => !!item?.id)
      )

      let pressTimer: ReturnType<typeof setTimeout> | null = null
      let isLongPressTriggered = false

      // Append only the clicked track to the end of the existing queue,
      // then jump to it. Keeps the queue state intact and the playing track
      // correctly highlighted in the queue view.
      const playNow = (index: number) => {
        if (isLongPressTriggered) {
          isLongPressTriggered = false
          return
        }
        const track = validItems.value[index]
        if (track?.url) cacheStore.cacheTrack(track.url)
        playerStore.setShuffle(false)
        const insertIndex = playerStore.queue.length
        playerStore.addToQueue([track])
        return playerStore.playTrackListIndex(insertIndex)
      }

      const toggleFavourite = async (id: string) => {
        const track = validItems.value.find(t => t.id === id)
        if (!track) return

        await favouriteStore.toggle('track', id)
        await sleep(300)

        if (isFavourite(id)) {
          if (track.url) await cacheStore.cacheTrack(track.url)
          emit('favourite-added', track)
        } else {
          if (track.url) await cacheStore.deleteTrack(track.url)
        }
      }

      const playNext = (track: Track) => {
        playerStore.setNextInQueue([track])
      }

      const addToQueue = (track: Track) => {
        playerStore.addToQueue([track])
      }

      const dragstart = (item: Track, event: DragEvent) => {
        onMouseUp()
        if (!item.isStream) {
          event.dataTransfer?.setData('application/x-track-id', item.id)
        }
      }

      const isFavourite = (id: string) =>
        favouriteStore.get('track', id)

      const menuRefs = new Map<string | number, any>()
      const setMenuRef = (el: any, key: string | number) => {
        if (el) menuRefs.set(key, el)
        else menuRefs.delete(key)
      }

      const openMenu = (key: string | number) => {
        const menu = menuRefs.get(key)
        if (menu && typeof menu.open === 'function') {
          menu.open()
        }
      }

      // Long press: the click that may follow must not start playback
      const triggerMenu = (key: string | number) => {
        isLongPressTriggered = true
        openMenu(key)
      }

      let mouseStart = { x: 0, y: 0 }

      const onMouseDown = (key: string | number, event: MouseEvent) => {
        // The menu overlay can swallow the click that ends a long press,
        // so a stale flag must never leak into the next press.
        isLongPressTriggered = false
        if (event.button !== 0) return
        mouseStart = { x: event.clientX, y: event.clientY }
        pressTimer = setTimeout(() => {
          pressTimer = null
          triggerMenu(key)
        }, LONG_PRESS_MS)
      }

      const onMouseMove = (event: MouseEvent) => {
        if (!pressTimer) return
        if (
          Math.abs(event.clientX - mouseStart.x) > MOUSE_MOVE_TOLERANCE ||
          Math.abs(event.clientY - mouseStart.y) > MOUSE_MOVE_TOLERANCE
        ) {
          onMouseUp()
        }
      }

      const onMouseUp = () => {
        if (pressTimer) {
          clearTimeout(pressTimer)
          pressTimer = null
        }
      }

      const onTouchStart = (key: string | number, _event: TouchEvent) => {
        isLongPressTriggered = false
        pressTimer = setTimeout(() => {
          pressTimer = null
          triggerMenu(key)
        }, LONG_PRESS_MS)
      }

      const onTouchEnd = () => {
        if (pressTimer) {
          clearTimeout(pressTimer)
          pressTimer = null
        }
      }

      return {
        validItems,
        playNow,
        playNext,
        addToQueue,
        toggleFavourite,
        dragstart,
        isFavourite,
        setMenuRef,
        openMenu,
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onTouchStart,
        onTouchEnd,
      }
    },
  })
</script>
