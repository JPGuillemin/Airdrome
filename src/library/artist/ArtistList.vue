// ArtistList.vue
<template>
  <Tiles :tile-size="tileSize" :allow-h-scroll="allowHScroll">
    <template v-for="item in items" :key="item.id">
      <Tile
        :to="{name: 'artist', params: { id: item.id } }"
        :title="item.name"
        :image="item.image"
        :circle="true"
        draggable="true"
        @dragstart="onMouseUp"
        @click.capture="onTileClick"
        @contextmenu.prevent="openMenu(item.id)"
        @mousedown="onMouseDown(item.id, $event)"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
        @touchstart="onTouchStart(item.id)"
        @touchend="onTouchEnd"
        @touchmove="onTouchEnd"
      >
        <template #text>
          <strong>{{ item.albumCount }}</strong> albums
        </template>
        <template v-if="tileSize > 79" #actions>
          <TileActionButton icon="random" label="Artist Shuffle" @click.stop="shuffleNow(item.id)" />
          <TileActionButton
            :icon="isFavourite(item.id) ? 'heart-fill' : 'heart'"
            label="Like"
            @click.stop="toggleFavourite(item.id)"
          />
        </template>
      </Tile>

      <!-- Same items as the ArtistDetails header buttons. -->
      <RowActionsMenu
        :ref="(el) => setMenuRef(el, item.id)"
        :track="item"
        :title="item.name"
        :default-actions="false"
      >
        <TrackMenuItem icon="play" class="on-top" @click="playNow(item.id)">
          Play
        </TrackMenuItem>
        <TrackMenuItem icon="random" class="on-top" @click="shuffleNow(item.id)">
          Shuffle
        </TrackMenuItem>
        <TrackMenuItem icon="radio" class="on-top" @click="radioNow(item.id)">
          Radio
        </TrackMenuItem>
        <TrackMenuItem :icon="isFavourite(item.id) ? 'heart-fill' : 'heart'" class="on-top" @click.stop="toggleFavourite(item.id)">
          Like
        </TrackMenuItem>
        <TrackMenuItem icon="plus" class="on-top" @click="addToPlaylist(item)">
          Playlist
        </TrackMenuItem>
      </RowActionsMenu>
    </template>

    <!-- "Playlist +": pick an existing playlist or create one (name pre-filled with the artist name). -->
    <Teleport to="body">
      <EditPlaylistModal
        v-if="showPlaylistModal"
        :playlist="playlistDraft"
        mode="add"
        @add-to-playlist="addToExistingPlaylist"
        @create-playlist="createPlaylist"
        @close="showPlaylistModal = false"
      />
    </Teleport>
  </Tiles>
</template>
<script lang="ts">
  import { defineComponent, inject, ref, computed } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlaylistStore } from '@/library/playlist/store'
  import { usePlayerStore } from '@/player/store'
  import { useRadioStore } from '@/player/radio'
  import { useLoader } from '@/shared/loader'
  import type { Playlist } from '@/shared/api'
  import RowActionsMenu from '@/library/track/RowActionsMenu.vue'
  import EditPlaylistModal from '@/library/playlist/EditPlaylistModal.vue'

  const LONG_PRESS_MS = 500
  // Pixels the mouse may drift during a long press before it is cancelled
  const MOUSE_MOVE_TOLERANCE = 5

  // Same breakpoint as Tiles.vue. On mobile, a long press already reveals the
  // overlay action buttons, so the RowActionsMenu is disabled there.
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches

  export default defineComponent({
    components: { RowActionsMenu, EditPlaylistModal },
    props: {
      items: { type: Array, required: true },
      allowHScroll: { type: Boolean, default: false },
      tileSize: { type: Number, default: 140 },
    },
    setup() {
      const favouriteStore = useFavouriteStore()
      const playlistStore = usePlaylistStore()
      const playerStore = usePlayerStore()
      const radioStore = useRadioStore()
      const loader = useLoader()
      const api = inject('$api') as any

      const toggleFavourite = async(id: string) => {
        await favouriteStore.toggle('artist', id)
      }

      const isFavourite = (id: string) => favouriteStore.get('artist', id)

      const shuffleNow = (id: string) => radioStore.shuffleArtist(id)

      const radioNow = (id: string) => radioStore.radioArtist(id)

      // Same as the ArtistDetails header "Play": artist top tracks
      const playNow = async (id: string) => {
        const artist = await api.getArtistDetails(id)
        if (artist?.topTracks?.length) return playerStore.playNow(artist.topTracks)
      }

      // "Playlist +": all tracks of the artist (from all their albums),
      // fetched only once the target playlist is known.
      const showPlaylistModal = ref(false)
      const playlistTarget = ref<any>(null)
      const playlistDraft = computed(() => ({
        name: playlistTarget.value?.name || '',
        comment: '',
        isPublic: false,
      }) as Playlist)

      const fetchAllTrackIds = async (): Promise<string[]> => {
        if (!playlistTarget.value) return []
        const ids: string[] = []
        for await (const tracks of api.getTracksByArtist(playlistTarget.value.id)) {
          ids.push(...tracks.map((t: any) => t.id))
        }
        return ids
      }

      const addToPlaylist = async (artist: any) => {
        playlistTarget.value = artist
        if (playlistStore.playlists === null) {
          loader.showLoading()
          try {
            await playlistStore.load()
          } catch (err) {
            console.error(err)
            return
          } finally {
            loader.hideLoading()
          }
        }
        showPlaylistModal.value = true
      }

      const addToExistingPlaylist = async (playlistId: string) => {
        showPlaylistModal.value = false
        loader.showLoading()
        try {
          await playlistStore.addUniqueTracks(playlistId, await fetchAllTrackIds())
        } catch (err) {
          console.error(err)
        } finally {
          loader.hideLoading()
        }
      }

      const createPlaylist = async (name: string) => {
        showPlaylistModal.value = false
        loader.showLoading()
        try {
          await playlistStore.addToPlaylistByName(name, await fetchAllTrackIds())
        } catch (err) {
          console.error(err)
        } finally {
          loader.hideLoading()
        }
      }

      // --- Row menu (right click / long press), same behaviour as TrackTiles ---
      let pressTimer: ReturnType<typeof setTimeout> | null = null
      let isLongPressTriggered = false

      const menuRefs = new Map<string | number, any>()
      const setMenuRef = (el: any, key: string | number) => {
        if (el) menuRefs.set(key, el)
        else menuRefs.delete(key)
      }

      const openMenu = (key: string | number) => {
        if (isMobile()) return
        const menu = menuRefs.get(key)
        if (menu && typeof menu.open === 'function') {
          menu.open()
        }
      }

      // Long press: the click that may follow must not navigate to the artist.
      // Capture phase so it runs before the router-link handler.
      const triggerMenu = (key: string | number) => {
        isLongPressTriggered = true
        openMenu(key)
      }

      const onTileClick = (event: Event) => {
        if (isLongPressTriggered) {
          isLongPressTriggered = false
          event.preventDefault()
          event.stopPropagation()
        }
      }

      let mouseStart = { x: 0, y: 0 }

      const onMouseDown = (key: string | number, event: MouseEvent) => {
        // The menu overlay can swallow the click that ends a long press,
        // so a stale flag must never leak into the next press.
        isLongPressTriggered = false
        if (isMobile()) return
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

      const onTouchStart = (key: string | number) => {
        isLongPressTriggered = false
        if (isMobile()) return
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
        favouriteStore,
        radioStore,
        toggleFavourite,
        isFavourite,
        shuffleNow,
        radioNow,
        playNow,
        showPlaylistModal,
        playlistDraft,
        addToPlaylist,
        addToExistingPlaylist,
        createPlaylist,
        setMenuRef,
        openMenu,
        onTileClick,
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onTouchStart,
        onTouchEnd,
      }
    },
  })
</script>