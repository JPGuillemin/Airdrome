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
            <span v-if="withArtist && item.artists && item.artists.length"> • </span>
            {{ item.year }}
          </span>
        </template>
        <!-- Hover Actions -->
        <template v-if="tileSize > 79" #actions>
          <TileActionButton icon="play" label="Play" @click.stop="playNow(item.id)" />
          <TileActionButton
            :icon="favouriteIcon(item.id)"
            label="Like"
            @click.stop="toggleFavourite(item.id)"
          />
        </template>
      </Tile>

      <!-- Same items as the AlbumDetails header buttons. -->
      <RowActionsMenu
        :ref="menuRefFor(item.id)"
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
        <TrackMenuItem :icon="favouriteIcon(item.id)" class="on-top" @click.stop="toggleFavourite(item.id)">
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

<script>
  import { defineComponent, inject, computed, ref } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlaylistStore } from '@/library/playlist/store'
  import { usePlayerStore } from '@/player/store'
  import { useRadioStore } from '@/player/radio'
  import { useCacheStore } from '@/shared/cache'
  import { useLoader } from '@/shared/loader'
  import RowActionsMenu from '@/library/track/RowActionsMenu.vue'
  import EditPlaylistModal from '@/library/playlist/EditPlaylistModal.vue'

  var LONG_PRESS_MS = 500
  // Pixels the mouse may drift during a long press before it is cancelled
  var MOUSE_MOVE_TOLERANCE = 5

  // Same breakpoint as Tiles.vue. On mobile, a long press already reveals the
  // overlay action buttons, so the RowActionsMenu is disabled there.
  function isMobile() {
    return window.matchMedia('(max-width: 768px)').matches
  }

  export default defineComponent({
    components: { RowActionsMenu: RowActionsMenu, EditPlaylistModal: EditPlaylistModal },
    props: {
      /** Albums displayed as tiles. */
      items: {
        type: Array,
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
    setup: function (props, context) {
      var emit = context.emit
      var favouriteStore = useFavouriteStore()
      var playlistStore = usePlaylistStore()
      var playerStore = usePlayerStore()
      var radioStore = useRadioStore()
      var cacheStore = useCacheStore()
      var loader = useLoader()
      var api = inject('$api')

      var validItems = computed(function () {
        return (props.items || []).filter(function (item) {
          return !!item && !!item.id
        })
      })

      function getAlbum(id) {
        return api.getAlbumDetails(id)
      }

      async function playNow(id) {
        playerStore.setShuffle(false)

        var album = await api.getAlbumDetails(id)
        return playerStore.playTrackList(album.tracks)
      }

      async function shuffleNow(id) {
        var album = await getAlbum(id)

        if (!album || !album.tracks || !album.tracks.length) {
          return
        }

        await radioStore.shuffleAlbum(album.tracks)
      }

      async function radioNow(id) {
        var album = await getAlbum(id)

        if (!album || !album.tracks || !album.tracks.length ||
          !album.artists || !album.artists.length) {
          return
        }

        await radioStore.radioAlbum(album.tracks, album.artists)
      }

      async function playNext(id) {
        var album = await getAlbum(id)

        if (album && album.tracks && album.tracks.length) {
          playerStore.setNextInQueue(album.tracks)
        }
      }

      async function addToQueue(id) {
        var album = await getAlbum(id)

        if (album && album.tracks && album.tracks.length) {
          playerStore.addToQueue(album.tracks)
        }
      }

      async function toggleFavourite(id) {
        await favouriteStore.toggle('album', id)

        var album = await api.getAlbumDetails(id)

        if (!album) {
          return
        }

        if (isFavourite(id)) {
          await cacheStore.cacheAlbum(album)
          emit('favourite-added', album)
        } else {
          await cacheStore.clearAlbumCache(album)
        }
      }

      function isFavourite(id) {
        return favouriteStore.get('album', id)
      }

      function favouriteIcon(id) {
        if (isFavourite(id)) {
          return 'heart-fill'
        }

        return 'heart'
      }

      // Cache state is only known once the album details are fetched,
      // so it is refreshed each time the menu opens.
      var cachedMap = ref({})

      async function refreshCached(id) {
        try {
          var album = await getAlbum(id)

          if (album) {
            cachedMap.value[id] = await cacheStore.isCached(album)
          }
        } catch (error) {
          console.error(error)
        }
      }

      async function cacheAlbum(id) {
        var album = await getAlbum(id)

        if (!album) {
          return
        }

        await cacheStore.cacheAlbum(album)
        cachedMap.value[id] = true
      }

      async function clearAlbumCache(id) {
        var album = await getAlbum(id)

        if (!album) {
          return
        }

        await cacheStore.clearAlbumCache(album)
        cachedMap.value[id] = false
      }

      // "Playlist +"
      var showPlaylistModal = ref(false)
      var playlistTarget = ref(null)

      var playlistDraft = computed(function () {
        var name = ''

        if (playlistTarget.value && playlistTarget.value.name) {
          name = playlistTarget.value.name
        }

        return {
          name: name,
          comment: '',
          isPublic: false,
        }
      })

      async function addToPlaylist(album) {
        playlistTarget.value = album

        if (playlistStore.playlists === null) {
          loader.showLoading()

          try {
            await playlistStore.load()
          } catch (error) {
            console.error(error)
            return
          } finally {
            loader.hideLoading()
          }
        }

        showPlaylistModal.value = true
      }

      async function fetchTrackIds() {
        if (!playlistTarget.value) {
          return []
        }

        var album = await getAlbum(playlistTarget.value.id)
        var tracks = (album && album.tracks) || []
        var ids = []

        for (var i = 0; i < tracks.length; i++) {
          ids.push(tracks[i].id)
        }

        return ids
      }

      async function addToExistingPlaylist(playlistId) {
        showPlaylistModal.value = false
        loader.showLoading()

        try {
          var ids = await fetchTrackIds()

          if (ids.length) {
            await playlistStore.addUniqueTracks(playlistId, ids)
          }
        } catch (error) {
          console.error(error)
        } finally {
          loader.hideLoading()
        }
      }

      async function createPlaylist(name) {
        showPlaylistModal.value = false
        loader.showLoading()

        try {
          var ids = await fetchTrackIds()

          if (ids.length) {
            await playlistStore.addToPlaylistByName(name, ids)
          }
        } catch (error) {
          console.error(error)
        } finally {
          loader.hideLoading()
        }
      }

      // --- Row menu (right click / long press), same behaviour as TrackTiles ---
      var pressTimer = null
      var isLongPressTriggered = false

      function dragstart(id, event) {
        onMouseUp()

        if (event.dataTransfer) {
          event.dataTransfer.setData('application/x-album-id', id)
        }
      }

      var menuRefs = new Map()

      function setMenuRef(el, key) {
        if (el) {
          menuRefs.set(key, el)
        } else {
          menuRefs.delete(key)
        }
      }

      /** Build the ref callback that registers the menu of a given tile. */
      function menuRefFor(key) {
        return function (el) {
          setMenuRef(el, key)
        }
      }

      function openMenu(key) {
        if (isMobile()) {
          return
        }

        var menu = menuRefs.get(key)

        if (menu && typeof menu.open === 'function') {
          menu.open()
          refreshCached(String(key))
        }
      }

      // Long press: the click that may follow must not navigate to the album.
      // Capture phase so it runs before the router-link handler.
      function triggerMenu(key) {
        isLongPressTriggered = true
        openMenu(key)
      }

      function onTileClick(event) {
        if (isLongPressTriggered) {
          isLongPressTriggered = false
          event.preventDefault()
          event.stopPropagation()
        }
      }

      var mouseStart = { x: 0, y: 0 }

      function onMouseDown(key, event) {
        // The menu overlay can swallow the click that ends a long press,
        // so a stale flag must never leak into the next press.
        isLongPressTriggered = false

        if (isMobile()) {
          return
        }

        if (event.button !== 0) {
          return
        }

        mouseStart = { x: event.clientX, y: event.clientY }

        pressTimer = setTimeout(function () {
          pressTimer = null
          triggerMenu(key)
        }, LONG_PRESS_MS)
      }

      function onMouseMove(event) {
        if (!pressTimer) {
          return
        }

        if (
          Math.abs(event.clientX - mouseStart.x) > MOUSE_MOVE_TOLERANCE ||
          Math.abs(event.clientY - mouseStart.y) > MOUSE_MOVE_TOLERANCE
        ) {
          onMouseUp()
        }
      }

      function onMouseUp() {
        if (pressTimer) {
          clearTimeout(pressTimer)
          pressTimer = null
        }
      }

      function onTouchStart(key) {
        isLongPressTriggered = false

        if (isMobile()) {
          return
        }

        pressTimer = setTimeout(function () {
          pressTimer = null
          triggerMenu(key)
        }, LONG_PRESS_MS)
      }

      function onTouchEnd() {
        if (pressTimer) {
          clearTimeout(pressTimer)
          pressTimer = null
        }
      }

      return {
        favouriteStore: favouriteStore,
        playerStore: playerStore,
        cacheStore: cacheStore,
        api: api,
        validItems: validItems,
        playNow: playNow,
        shuffleNow: shuffleNow,
        radioNow: radioNow,
        playNext: playNext,
        addToQueue: addToQueue,
        toggleFavourite: toggleFavourite,
        dragstart: dragstart,
        isFavourite: isFavourite,
        favouriteIcon: favouriteIcon,
        cachedMap: cachedMap,
        cacheAlbum: cacheAlbum,
        clearAlbumCache: clearAlbumCache,
        showPlaylistModal: showPlaylistModal,
        playlistDraft: playlistDraft,
        addToPlaylist: addToPlaylist,
        addToExistingPlaylist: addToExistingPlaylist,
        createPlaylist: createPlaylist,
        setMenuRef: setMenuRef,
        menuRefFor: menuRefFor,
        openMenu: openMenu,
        onTileClick: onTileClick,
        onMouseDown: onMouseDown,
        onMouseMove: onMouseMove,
        onMouseUp: onMouseUp,
        onTouchStart: onTouchStart,
        onTouchEnd: onTouchEnd,
      }
    },
  })
</script>