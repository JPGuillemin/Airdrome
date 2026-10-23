// AlbumList.vue
<template>
  <Tiles :tile-size="tileSize" :allow-h-scroll="allowHScroll" :twin-rows="twinRows">
    <template v-for="(item, index) in validItems" :key="item.id || index">
      <Tile
        :to="{ name: 'album', params: { id: item.id } }"
        :title="item.name || 'Unknown Album'"
        :image="item.image || ''"
        draggable="true"
        :title-only="titleOnly"
        @dragstart="dragstart(item.id, $event)"
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
        <!-- Artists and Date -->
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
          <!-- Date -->
          <span v-if="withDate" class="text-muted">
            <span v-if="withArtist && item.artists?.length"> • </span>
            {{ item.year }}
          </span>
        </template>
        <!-- Hover Actions -->
        <template v-if="tileSize > 79" #actions>
          <TileActionButton icon="play" label="Play" @click.stop="playNow(item.id)" />
          <TileActionButton
            :icon="isFavourite(item.id) ? 'heart-fill' : 'heart'"
            label="Like"
            @click.stop="toggleFavourite(item.id)"
          />
        </template>
      </Tile>

      <!-- Same items as the AlbumDetails header buttons. -->
      <RowActionsMenu
        :ref="(el) => setMenuRef(el, item.id)"
        :track="item"
        :title="item.name"
        :default-actions="false"
      >
        <TrackMenuItem icon="recycle" class="on-top" @click="playNow(item.id)">
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
        <TrackMenuItem icon="plus" class="on-top" @click="playNext(item.id)">
          Next
        </TrackMenuItem>
        <TrackMenuItem icon="plus" class="on-top" @click="addToQueue(item.id)">
          Queue
        </TrackMenuItem>
        <TrackMenuItem icon="plus" class="on-top" @click="addToPlaylist(item)">
          Playlist
        </TrackMenuItem>
        <TrackMenuItem v-if="cachedMap[item.id] === false" icon="download" class="on-top" @click="cacheAlbum(item.id)">
          Cache
        </TrackMenuItem>
        <TrackMenuItem v-if="cachedMap[item.id] === true" icon="trash" class="on-top" @click="clearAlbumCache(item.id)">
          Cache
        </TrackMenuItem>
      </RowActionsMenu>
    </template>

    <!-- "Playlist +": pick an existing playlist or create one (name pre-filled with the album name). -->
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
  import { defineComponent, inject, computed, ref } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlaylistStore } from '@/library/playlist/store'
  import { usePlayerStore } from '@/player/store'
  import { useRadioStore } from '@/player/radio'
  import { useCacheStore } from '@/shared/cache'
  import { useLoader } from '@/shared/loader'
  import type { Album, Playlist } from '@/shared/api'
  import { sleep } from '@/shared/utils'
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
      items: {
        type: Array as () => Album[],
        required: true,
      },
      allowHScroll: { type: Boolean, default: false },
      tileSize: { type: Number, default: 140 },
      twinRows: { type: Boolean, default: false },
      titleOnly: { type: Boolean, default: false },
      withArtist: { type: Boolean, default: true },
      withDate: { type: Boolean, default: false },
    },
    emits: ['favourite-added'],
    setup(props, { emit }) {
      const favouriteStore = useFavouriteStore()
      const playlistStore = usePlaylistStore()
      const playerStore = usePlayerStore()
      const radioStore = useRadioStore()
      const cacheStore = useCacheStore()
      const loader = useLoader()
      const api = inject('$api') as any

      const validItems = computed(() => {
        return (props.items || []).filter((item): item is Album => !!item?.id)
      })

      const getAlbum = (id: string) => api.getAlbumDetails(id)

      const playNow = async (id: string) => {
        playerStore.setShuffle(false)
        const album = await api.getAlbumDetails(id)
        return playerStore.playTrackList(album.tracks!)
      }

      const shuffleNow = async (id: string) => {
        const album = await getAlbum(id)
        if (!album?.tracks?.length) return
        await radioStore.shuffleAlbum(album.tracks)
      }

      const radioNow = async (id: string) => {
        const album = await getAlbum(id)
        if (!album?.tracks?.length || !album?.artists?.length) return
        await radioStore.radioAlbum(album.tracks, album.artists)
      }

      const playNext = async (id: string) => {
        const album = await getAlbum(id)
        if (album?.tracks?.length) playerStore.setNextInQueue(album.tracks)
      }

      const addToQueue = async (id: string) => {
        const album = await getAlbum(id)
        if (album?.tracks?.length) playerStore.addToQueue(album.tracks)
      }

      const toggleFavourite = async (id: string) => {
        await favouriteStore.toggle('album', id)
        await sleep(300)
        const album = await api.getAlbumDetails(id)
        if (!album) return
        if (isFavourite(id)) {
          await cacheStore.cacheAlbum(album)
          emit('favourite-added', album)
        } else {
          await cacheStore.clearAlbumCache(album)
        }
      }

      const isFavourite = (id: string) => {
        return favouriteStore.get('album', id)
      }

      // Cache state is only known once the album details are fetched,
      // so it is refreshed each time the menu opens.
      const cachedMap = ref<Record<string, boolean>>({})

      const refreshCached = async (id: string) => {
        try {
          const album = await getAlbum(id)
          if (album) cachedMap.value[id] = await cacheStore.isCached(album)
        } catch (err) {
          console.error(err)
        }
      }

      const cacheAlbum = async (id: string) => {
        const album = await getAlbum(id)
        if (!album) return
        await cacheStore.cacheAlbum(album)
        cachedMap.value[id] = true
      }

      const clearAlbumCache = async (id: string) => {
        const album = await getAlbum(id)
        if (!album) return
        await cacheStore.clearAlbumCache(album)
        cachedMap.value[id] = false
      }

      // "Playlist +"
      const showPlaylistModal = ref(false)
      const playlistTarget = ref<Album | null>(null)
      const playlistDraft = computed(() => ({
        name: playlistTarget.value?.name || '',
        comment: '',
        isPublic: false,
      }) as Playlist)

      const addToPlaylist = async (album: Album) => {
        playlistTarget.value = album
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

      const fetchTrackIds = async (): Promise<string[]> => {
        if (!playlistTarget.value) return []
        const album = await getAlbum(playlistTarget.value.id)
        return (album?.tracks || []).map((t: any) => t.id)
      }

      const addToExistingPlaylist = async (playlistId: string) => {
        showPlaylistModal.value = false
        loader.showLoading()
        try {
          const ids = await fetchTrackIds()
          if (ids.length) await playlistStore.addUniqueTracks(playlistId, ids)
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
          const ids = await fetchTrackIds()
          if (ids.length) await playlistStore.addToPlaylistByName(name, ids)
        } catch (err) {
          console.error(err)
        } finally {
          loader.hideLoading()
        }
      }

      // --- Row menu (right click / long press), same behaviour as TrackTiles ---
      let pressTimer: ReturnType<typeof setTimeout> | null = null
      let isLongPressTriggered = false

      const dragstart = (id: string, event: DragEvent) => {
        onMouseUp()
        event.dataTransfer?.setData('application/x-album-id', id)
      }

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
          refreshCached(String(key))
        }
      }

      // Long press: the click that may follow must not navigate to the album.
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
        playerStore,
        cacheStore,
        api,
        validItems,
        playNow,
        shuffleNow,
        radioNow,
        playNext,
        addToQueue,
        toggleFavourite,
        dragstart,
        isFavourite,
        cachedMap,
        cacheAlbum,
        clearAlbumCache,
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