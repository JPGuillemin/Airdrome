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
        @dragstart="rowMenu.onMouseUp"
        @click.capture="onTileClick"
        @contextmenu.prevent="rowMenu.onContextMenu(item.id, $event)"
        @mousedown="rowMenu.onMouseDown(item.id, $event)"
        @mousemove="rowMenu.onMouseMove"
        @mouseup="rowMenu.onMouseUp"
        @mouseleave="rowMenu.onMouseUp"
        @touchstart="rowMenu.onTouchStart(item.id, $event)"
        @touchend="rowMenu.onTouchEnd"
        @touchmove="rowMenu.onTouchMove"
      >
        <template #text>
          <strong>{{ item.albumCount }}</strong> albums
        </template>
        <template v-if="tileSize > 79" #actions>
          <TileActionButton icon="random" label="Artist Shuffle" @click.stop="shuffleNow(item.id)" />
          <TileActionButton
            :icon="favouriteIcon(item.id)"
            label="Like"
            @click.stop="toggleFavourite(item.id)"
          />
        </template>
      </Tile>

      <!-- Same items as the ArtistDetails header buttons. -->
      <RowActionsMenu
        :ref="rowMenu.menuRefFor(item.id)"
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
        <TrackMenuItem :icon="favouriteIcon(item.id)" class="on-top" @click.stop="toggleFavourite(item.id)">
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
<script>
  import { defineComponent, inject, ref, computed } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlaylistStore } from '@/library/playlist/store'
  import { usePlayerStore } from '@/player/store'
  import { useRadioStore } from '@/player/radio'
  import { useLoader } from '@/shared/loader'
  import { useRowMenu } from '@/shared/useRowMenu'
  import RowActionsMenu from '@/library/track/RowActionsMenu.vue'
  import EditPlaylistModal from '@/library/playlist/EditPlaylistModal.vue'

  // Same breakpoint as Tiles.vue. On mobile, a long press already reveals the
  // overlay action buttons, so the RowActionsMenu is disabled there.
  function isMobile() {
    return window.matchMedia('(max-width: 768px)').matches
  }

  export default defineComponent({
    components: {
      RowActionsMenu: RowActionsMenu,
      EditPlaylistModal: EditPlaylistModal,
    },

    props: {
      /** Artist items displayed by the list. */
      items: { type: Array, required: true },
      /** Whether the tiles can scroll horizontally. */
      allowHScroll: { type: Boolean, default: false },
      /** Tile size in pixels. */
      tileSize: { type: Number, default: 140 },
    },

    setup: function () {
      var favouriteStore = useFavouriteStore()
      var playlistStore = usePlaylistStore()
      var playerStore = usePlayerStore()
      var radioStore = useRadioStore()
      var loader = useLoader()
      var api = inject('$api')
      var rowMenu = useRowMenu({
        enabled: function () {
          return !isMobile()
        }
      })

      async function toggleFavourite(id) {
        await favouriteStore.toggle('artist', id)
      }

      function isFavourite(id) {
        return favouriteStore.get('artist', id)
      }

      function favouriteIcon(id) {
        if (isFavourite(id)) {
          return 'heart-fill'
        }

        return 'heart'
      }

      async function shuffleNow(id) {
        return await radioStore.shuffleArtist(id)
      }

      async function radioNow(id) {
        return await radioStore.radioArtist(id)
      }

      // Same as the ArtistDetails header "Play": artist top tracks
      async function playNow(id) {
        var artist = await api.getArtistDetails(id)

        if (artist && artist.topTracks && artist.topTracks.length) {
          return await playerStore.playNow(artist.topTracks)
        }
      }

      // "Playlist +": all tracks of the artist (from all their albums),
      // fetched only once the target playlist is known.
      var showPlaylistModal = ref(false)
      var playlistTarget = ref(null)

      /** Draft playlist used to prefill the playlist creation form. */
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

      /**
       * Collect the IDs of every track of the target artist.
       *
       * @returns {Promise<string[]>}
       */
      async function fetchAllTrackIds() {
        if (!playlistTarget.value) {
          return []
        }

        var ids = []
        var iterator = api.getTracksByArtist(playlistTarget.value.id)

        while (true) {
          var item = await iterator.next()

          if (item.done) {
            break
          }

          var tracks = item.value

          for (var i = 0; i < tracks.length; i++) {
            ids.push(tracks[i].id)
          }
        }

        return ids
      }

      async function addToPlaylist(artist) {
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

      async function addToExistingPlaylist(playlistId) {
        showPlaylistModal.value = false
        loader.showLoading()

        try {
          var ids = await fetchAllTrackIds()
          await playlistStore.addUniqueTracks(playlistId, ids)
        } catch (err) {
          console.error(err)
        } finally {
          loader.hideLoading()
        }
      }

      async function createPlaylist(name) {
        showPlaylistModal.value = false
        loader.showLoading()

        try {
          var ids = await fetchAllTrackIds()
          await playlistStore.addToPlaylistByName(name, ids)
        } catch (err) {
          console.error(err)
        } finally {
          loader.hideLoading()
        }
      }

      // --- Row menu (right click / long press), handled by useRowMenu ---
      // Long press: the click that may follow must not navigate to the artist.
      // Capture phase so it runs before the router-link handler.
      function onTileClick(event) {
        if (rowMenu.consumeSuppressedClick()) {
          event.preventDefault()
          event.stopPropagation()
        }
      }

      return {
        favouriteStore: favouriteStore,
        radioStore: radioStore,
        rowMenu: rowMenu,
        toggleFavourite: toggleFavourite,
        isFavourite: isFavourite,
        favouriteIcon: favouriteIcon,
        shuffleNow: shuffleNow,
        radioNow: radioNow,
        playNow: playNow,
        showPlaylistModal: showPlaylistModal,
        playlistDraft: playlistDraft,
        addToPlaylist: addToPlaylist,
        addToExistingPlaylist: addToExistingPlaylist,
        createPlaylist: createPlaylist,
        onTileClick: onTileClick,
      }
    },
  })
</script>