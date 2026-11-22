<template>
  <div>
    <div v-if="visible" class="track-info-overlay" @click="$emit('close')" />
    <div v-if="visible && track" class="track-info-dialog">
      <div class="track-info-header">
        <div
          class="track-info-backdrop"
          :style="{ '--backgroundImage': backgroundImage }"
        />

        <div class="track-info-title-row d-flex gap-3">
          <img
            v-if="track.image"
            :src="track.image"
            class="track-info-cover"
            alt=""
          >
          <div style="min-width: 0">
            <div class="track-info-title">
              {{ track.title }}
            </div>
            <div class="text-muted small">
              <template v-if="artistLinks.length">
                <span v-for="(artist, index) in artistLinks" :key="artist.id">
                  <span v-if="index > 0">, </span>
                  <router-link
                    :to="{ name: 'artist', params: { id: artist.id } }"
                    class="track-info-banner-link"
                    @click="$emit('close')"
                  >
                    {{ artist.name }}
                  </router-link>
                </span>
              </template>
              <template v-else>
                —
              </template>
            </div>
            <div class="text-muted small">
              <router-link
                v-if="albumId"
                :to="{ name: 'album', params: { id: albumId } }"
                class="track-info-banner-link"
                @click="$emit('close')"
              >
                {{ albumName || '—' }}
              </router-link>
              <template v-else>
                {{ albumName || '—' }}
              </template>
            </div>
          </div>
        </div>
      </div>

      <div v-if="albumId" class="track-info-actions">
        <div class="d-flex flex-wrap align-items-center" :class="{ invisible: !album }">
          <b-button v-longpress-tooltip variant="transparent" class="header-buttons" title="Album Play" @click="playNow">
            <Icon icon="recycle" />
          </b-button>
          <b-button v-longpress-tooltip variant="transparent" class="header-buttons" title="Album Shuffle" @click="shuffleNow">
            <Icon icon="random" />
          </b-button>
          <b-button v-longpress-tooltip variant="transparent" class="header-buttons" title="Album Radio" @click="RadioNow">
            <Icon icon="radio" />
          </b-button>
          <b-button v-longpress-tooltip variant="transparent" class="header-buttons" title="Like Album" @click="toggleFavourite">
            <Icon :icon="favouriteIcon" />
          </b-button>
          <ExternalLink
            v-if="listenBrainzUrl"
            :href="listenBrainzUrl"
            class="btn btn-link header-buttons"
            title="MusicBrainz"
          >
            <IconMusicBrainz />
          </ExternalLink>
          <ExternalLink
            v-if="youTubeUrl"
            :href="youTubeUrl"
            class="btn btn-link header-buttons"
            title="YouTube"
          >
            <IconYouTube />
          </ExternalLink>
          <ExternalLink
            v-if="youTubeMusicUrl"
            :href="youTubeMusicUrl"
            class="btn btn-link header-buttons"
            title="YouTube Music"
          >
            <IconYouTubeMusic />
          </ExternalLink>
          <OverflowMenu direction="up" variant="transparent" class="header-buttons" :z-index="10001">
            <TrackMenuItem icon="plus" class="on-top" @click="setNextInQueue">
              Next
            </TrackMenuItem>
            <TrackMenuItem icon="plus" class="on-top" @click="addToQueue">
              Queue
            </TrackMenuItem>
            <TrackMenuItem icon="plus" class="on-top" @click="addToPlaylist">
              Playlist
            </TrackMenuItem>
            <TrackMenuItem v-if="!cached" icon="download" class="on-top" @click="cacheTrack">
              Cache
            </TrackMenuItem>
            <TrackMenuItem v-if="cached" icon="trash" class="on-top" @click="clearTrackCache">
              Cache
            </TrackMenuItem>
          </OverflowMenu>
        </div>
      </div>

      <div class="track-info-body p-3">
        <dl class="row mb-0 small can-select">
          <dt class="col-5">
            Year
          </dt>
          <dd class="col-7">
            {{ year || '—' }}
          </dd>

          <dt class="col-5">
            Genre
          </dt>
          <dd class="col-7">
            {{ genres || '—' }}
          </dd>

          <dt class="col-5">
            Track
          </dt>
          <dd class="col-7">
            {{ trackNumber }}
          </dd>

          <dt class="col-5">
            Duration
          </dt>
          <dd class="col-7">
            {{ duration }}
          </dd>

          <dt class="col-5">
            File codec
          </dt>
          <dd class="col-7">
            {{ fileCodec }}
          </dd>

          <dt class="col-5">
            File bitrate
          </dt>
          <dd class="col-7">
            {{ fileBitrate }}
          </dd>

          <template v-if="fileDetails">
            <dt class="col-5">
              Audio
            </dt>
            <dd class="col-7">
              {{ fileDetails }}
            </dd>
          </template>

          <dt class="col-5">
            Stream
          </dt>
          <dd class="col-7">
            {{ streamLabel }}
          </dd>

          <template v-if="replayGainLabel">
            <dt class="col-5">
              ReplayGain
            </dt>
            <dd class="col-7">
              {{ replayGainLabel }}
            </dd>
          </template>
        </dl>

      </div>
    </div>

    <Teleport to="body">
      <div v-if="showPlaylistModal" class="track-info-playlist-layer">
        <EditPlaylistModal
          :playlist="playlistDraft"
          mode="add"
          @add-to-playlist="addToExistingPlaylist"
          @create-playlist="createPlaylist"
          @close="showPlaylistModal = false"
        />
      </div>
    </Teleport>
  </div>
</template>

<script>
  import { defineComponent, ref, computed, watch, inject } from 'vue'
  import { formatDuration } from '@/shared/utils'
  import ExternalLink from '@/shared/components/ExternalLink.vue'
  import IconMusicBrainz from '@/shared/components/IconMusicBrainz.vue'
  import IconYouTube from '@/shared/components/IconYouTube.vue'
  import IconYouTubeMusic from '@/shared/components/IconYouTubeMusic.vue'
  import EditPlaylistModal from '@/library/playlist/EditPlaylistModal.vue'
  import fallbackImage from '@/shared/assets/fallback.svg'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlaylistStore } from '@/library/playlist/store'
  import { usePlayerStore } from '@/player/store'
  import { useCacheStore } from '@/shared/cache'
  import { useLoader } from '@/shared/loader'
  import { useRadioStore } from '@/player/radio'
  import {
    getAlbumListenBrainzUrl,
    getArtistListenBrainzUrl,
  } from '@/shared/musicbrainz'

  export default defineComponent({
    props: {
      /** Whether the dialog is visible. */
      visible: { type: Boolean, required: true },
      /** Currently playing track, or null. */
      track: { type: Object, default: null },
    },

    emits: ['close'],

    components: {
      ExternalLink: ExternalLink,
      IconMusicBrainz: IconMusicBrainz,
      IconYouTube: IconYouTube,
      IconYouTubeMusic: IconYouTubeMusic,
      EditPlaylistModal: EditPlaylistModal,
    },

    setup: function (props) {
      var api = inject('$api')
      var favouriteStore = useFavouriteStore()
      var playlistStore = usePlaylistStore()
      var playerStore = usePlayerStore()
      var cacheStore = useCacheStore()
      var loader = useLoader()
      var radioStore = useRadioStore()

      var album = ref(null)
      var loadingAlbum = ref(false)
      var listenBrainzUrl = ref('')
      var albumToken = 0
      var showPlaylistModal = ref(false)

      var trackUrl = computed(function () {
        return props.track && props.track.url ? props.track.url : ''
      })

      var cached = computed(function () {
        if (!trackUrl.value) {
          return false
        }

        return cacheStore.cacheStatus.get(trackUrl.value) === true
      })

      watch(
        trackUrl,
        function (url) {
          if (url && !cacheStore.cacheStatus.has(url)) {
            cacheStore.refreshStatus(url)
          }
        },
        { immediate: true }
      )

      var backgroundImage = computed(function () {
        var image = fallbackImage

        if (props.track && props.track.image) {
          image = props.track.image
        }

        return "url('" + image + "')"
      })

      var isFavourite = computed(function () {
        return !!album.value && favouriteStore.get('album', album.value.id)
      })

      var favouriteIcon = computed(function () {
        if (isFavourite.value) {
          return 'heart-fill'
        }

        return 'heart'
      })

      var artistLinks = computed(function () {
        if (props.track && props.track.artists && props.track.artists.length) {
          return props.track.artists
        }

        if (album.value && album.value.artists && album.value.artists.length) {
          return album.value.artists
        }

        return []
      })

      var artistNames = computed(function () {
        return artistLinks.value.map(function (artist) {
          return artist.name
        }).join(', ')
      })

      var albumId = computed(function () {
        if (props.track && props.track.albumId) {
          return props.track.albumId
        }

        return album.value ? album.value.id : null
      })

      var albumName = computed(function () {
        if (props.track && props.track.album) {
          return props.track.album
        }

        return album.value ? album.value.name : ''
      })

      var year = computed(function () {
        return album.value && album.value.year ? album.value.year : ''
      })

      var genres = computed(function () {
        if (!album.value || !album.value.genres) {
          return ''
        }

        return album.value.genres.map(function (genre) {
          return genre.name
        }).join(', ')
      })

      var trackNumber = computed(function () {
        if (!props.track || props.track.track == null) {
          return '—'
        }

        return props.track.track
      })

      var duration = computed(function () {
        return props.track ? formatDuration(props.track.duration) : '—'
      })

      var fileCodec = computed(function () {
        if (!props.track) {
          return '—'
        }

        if (props.track.suffix) {
          return props.track.suffix.toUpperCase()
        }

        return props.track.contentType || '—'
      })

      var fileBitrate = computed(function () {
        if (!props.track || !props.track.bitRate) {
          return '—'
        }

        return props.track.bitRate + ' kbps'
      })

      var fileDetails = computed(function () {
        if (!props.track) {
          return ''
        }

        var parts = []

        if (props.track.samplingRate) {
          parts.push((props.track.samplingRate / 1000).toFixed(1) + ' kHz')
        }

        if (props.track.bitDepth) {
          parts.push(props.track.bitDepth + '-bit')
        }

        if (props.track.channelCount) {
          parts.push(props.track.channelCount + ' ch')
        }

        return parts.join(' · ')
      })

      var streamInfo = computed(function () {
        if (!props.track || !props.track.url) {
          return null
        }

        try {
          var url = new URL(props.track.url)
          return {
            format: url.searchParams.get('format') || 'raw',
            bitRate: url.searchParams.get('maxBitRate') || ''
          }
        } catch (error) {
          return null
        }
      })

      var streamLabel = computed(function () {
        if (!streamInfo.value) {
          return '—'
        }

        if (streamInfo.value.format === 'raw') {
          return 'Raw (no transcoding)'
        }

        var label = streamInfo.value.format.toUpperCase()

        if (streamInfo.value.bitRate && streamInfo.value.bitRate !== '0') {
          label += ' · ' + streamInfo.value.bitRate + ' kbps'
        }

        return label
      })

      var youTubeMusicUrl = computed(function () {
        if (!props.track) {
          return ''
        }

        var query = []

        if (artistNames.value) {
          query.push(artistNames.value)
        }

        if (props.track.title) {
          query.push(props.track.title)
        }

        if (!query.length) {
          return ''
        }

        return 'https://music.youtube.com/search?q=' + encodeURIComponent(query.join(' '))
      })

      var youTubeUrl = computed(function () {
        if (!props.track) {
          return ''
        }

        var query = []

        if (artistNames.value) {
          query.push(artistNames.value)
        }

        if (props.track.title) {
          query.push(props.track.title)
        }

        if (!query.length) {
          return ''
        }

        return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query.join(' '))
      })

      var replayGainLabel = computed(function () {
        if (!props.track || !props.track.replayGain) {
          return ''
        }

        var gain = props.track.replayGain
        return 'Track ' + gain.trackGain + ' dB / Album ' + gain.albumGain + ' dB'
      })

      async function loadAlbum() {
        var current = props.track

        if (!props.visible || !current) {
          album.value = null
          showPlaylistModal.value = false
          listenBrainzUrl.value = ''
          loadingAlbum.value = false
          return
        }

        var token = albumToken + 1
        albumToken = token
        album.value = null
        showPlaylistModal.value = false
        loadingAlbum.value = true
        listenBrainzUrl.value = ''

        try {
          if (!current.albumId) {
            var artist = current.artists && current.artists.length
              ? current.artists[0].name
              : ''

            if (artist) {
              var artistUrl = await getArtistListenBrainzUrl(artist)

              if (token === albumToken && artistUrl.indexOf('/artist/') !== -1) {
                listenBrainzUrl.value = artistUrl
              }
            }

            return
          }

          var result = await api.getAlbumDetails(current.albumId)

          if (token !== albumToken) {
            return
          }

          album.value = result

          var listenBrainz = result.musicBrainzUrl || ''

          if (!listenBrainz) {
            var artistName = current.artists && current.artists.length
              ? current.artists[0].name
              : ''

            try {
              listenBrainz = await getAlbumListenBrainzUrl(artistName, result.name)
            } catch (error) {
              listenBrainz = ''
            }
          }

          if (token === albumToken) {
            // Ignore the generic fallback URL returned when no match is found.
            listenBrainzUrl.value = listenBrainz && listenBrainz.indexOf('/album/') !== -1
              ? listenBrainz
              : ''
          }
        } catch (error) {
          if (token === albumToken) {
            album.value = null
            console.warn('[TrackInfo] failed to load album details', error)
          }
        } finally {
          if (token === albumToken) {
            loadingAlbum.value = false
          }
        }
      }

      function albumTracks() {
        if (!album.value || !album.value.tracks) {
          return []
        }

        return album.value.tracks
      }

      function playNow() {
        var tracks = albumTracks()

        if (tracks.length) {
          return playerStore.playNow(tracks)
        }
      }

      function shuffleNow() {
        var tracks = albumTracks()

        if (tracks.length) {
          return radioStore.shuffleAlbum(tracks)
        }
      }

      function RadioNow() {
        var tracks = albumTracks()

        if (!tracks.length || !album.value.artists || !album.value.artists.length) {
          return
        }

        return radioStore.radioAlbum(tracks, album.value.artists)
      }

      function toggleFavourite() {
        if (!album.value) {
          return
        }

        return favouriteStore.toggle('album', album.value.id)
      }

      function setNextInQueue() {
        if (props.track) {
          return playerStore.setNextInQueue([props.track])
        }
      }

      function addToQueue() {
        if (props.track) {
          return playerStore.addToQueue([props.track])
        }
      }

      var playlistDraft = computed(function () {
        var name = ''

        if (props.track && props.track.title) {
          name = props.track.title
        }

        return {
          name: name,
          comment: '',
          isPublic: false,
        }
      })

      async function addToPlaylist() {
        if (!props.track) {
          return
        }

        if (playlistStore.playlists !== null) {
          showPlaylistModal.value = true
          return
        }

        loader.showLoading()

        try {
          await playlistStore.load()
        } catch (error) {
          console.error(error)
          return
        } finally {
          loader.hideLoading()
        }

        showPlaylistModal.value = true
      }

      async function addToExistingPlaylist(playlistId) {
        if (!props.track) {
          return
        }

        showPlaylistModal.value = false
        loader.showLoading()

        try {
          await playlistStore.addUniqueTracks(playlistId, [props.track.id])
        } catch (error) {
          console.error(error)
        } finally {
          loader.hideLoading()
        }
      }

      async function createPlaylist(name) {
        if (!props.track) {
          return
        }

        showPlaylistModal.value = false
        loader.showLoading()

        try {
          await playlistStore.addToPlaylistByName(name, [props.track.id])
        } catch (error) {
          console.error(error)
        } finally {
          loader.hideLoading()
        }
      }

      function cacheTrack() {
        if (props.track && props.track.url) {
          cacheStore.cacheTrack(props.track.url)
        }
      }

      async function clearTrackCache() {
        if (props.track && props.track.url) {
          await cacheStore.deleteTrack(props.track.url)
        }
      }

      watch(
        function () {
          return [props.visible, props.track ? props.track.id : null]
        },
        function () {
          loadAlbum()
        },
        { immediate: true }
      )

      return {
        album: album,
        cached: cached,
        loadingAlbum: loadingAlbum,
        showPlaylistModal: showPlaylistModal,
        playlistDraft: playlistDraft,
        backgroundImage: backgroundImage,
        favouriteIcon: favouriteIcon,
        artistLinks: artistLinks,
        artistNames: artistNames,
        albumId: albumId,
        albumName: albumName,
        year: year,
        genres: genres,
        trackNumber: trackNumber,
        duration: duration,
        fileCodec: fileCodec,
        fileBitrate: fileBitrate,
        fileDetails: fileDetails,
        streamLabel: streamLabel,
        replayGainLabel: replayGainLabel,
        listenBrainzUrl: listenBrainzUrl,
        youTubeMusicUrl: youTubeMusicUrl,
        youTubeUrl: youTubeUrl,
        playNow: playNow,
        shuffleNow: shuffleNow,
        RadioNow: RadioNow,
        toggleFavourite: toggleFavourite,
        setNextInQueue: setNextInQueue,
        addToQueue: addToQueue,
        addToPlaylist: addToPlaylist,
        addToExistingPlaylist: addToExistingPlaylist,
        createPlaylist: createPlaylist,
        cacheTrack: cacheTrack,
        clearTrackCache: clearTrackCache,
      }
    },
  })
</script>

<style scoped>
  .track-info-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 9998;
  }

  .track-info-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    width: min(28rem, 92vw);
    max-height: 85vh;
    overflow: hidden;
    background: var(--theme-elevation-1);
    border: 1px solid var(--theme-border);
    border-radius: var(--theme-radius-md);
    box-shadow: var(--theme-shadow-2);
    z-index: 9999;
  }

  .track-info-header {
    position: relative;
    flex: 0 0 auto;
    overflow: hidden;
    padding: 1rem;
    border-radius: var(--theme-radius-md) var(--theme-radius-md) 0 0;
  }

  .track-info-backdrop {
    position: absolute;
    top: -15px;
    left: -15px;
    width: calc(100% + 30px);
    height: calc(100% + 30px);
    z-index: 0;
    opacity: 0.92;
    filter: blur(5px);
    background-image: linear-gradient(to bottom, transparent, var(--theme-elevation-1)), var(--backgroundImage);
    background-size: cover;
    background-position: center;
    pointer-events: none;
  }

  .track-info-header > *:not(.track-info-backdrop) {
    position: relative;
    z-index: 1;
  }

  .track-info-actions {
    flex: 0 0 auto;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--theme-border);
  }

  .track-info-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    scrollbar-gutter: stable;
  }

  .track-info-actions .header-buttons {
    margin-inline-end: 0.5rem;
  }

  .track-info-actions .header-buttons:last-child {
    margin-inline-end: 0;
  }

  .track-info-playlist-layer {
    position: fixed;
    inset: 0;
    z-index: 10002;
  }

  .track-info-cover {
    width: 72px;
    height: 72px;
    object-fit: cover;
    border-radius: var(--theme-radius-sm);
    flex-shrink: 0;
  }

  .track-info-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .track-info-title-row .text-muted {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-info-banner-link {
    color: inherit;
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .track-info-banner-link:hover {
    color: var(--bs-primary);
  }

  dl {
    margin-bottom: 0;
  }

  dt {
    color: var(--theme-text-muted);
    font-weight: 500;
  }

  dd {
    margin-bottom: 0.25rem;
    word-break: break-word;
  }

</style>
