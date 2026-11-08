<template>
  <div>
    <div v-if="visible" class="track-info-overlay" @click="$emit('close')" />
    <div v-if="visible && track" class="track-info-dialog p-3">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h5 class="mb-0">
          Track info
        </h5>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          title="Close"
          @click="$emit('close')"
        />
      </div>

      <div class="d-flex gap-3 mb-3">
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
            {{ artistNames || '—' }}
          </div>
          <div class="text-muted small">
            {{ albumName || '—' }}
          </div>
        </div>
      </div>

      <dl class="row mb-0 small can-select">
        <dt class="col-5">
          Album
        </dt>
        <dd class="col-7">
          {{ albumName || '—' }}
        </dd>

        <dt class="col-5">
          Artist
        </dt>
        <dd class="col-7">
          {{ artistNames || '—' }}
        </dd>

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

      <div v-if="loadingAlbum" class="text-muted small mt-2">
        Loading album details…
      </div>

      <div v-if="listenBrainzUrl || youTubeMusicUrl" class="d-flex flex-wrap gap-3 mt-3">
        <ExternalLink
          v-if="listenBrainzUrl"
          :href="listenBrainzUrl"
          class="track-info-link"
        >
          ListenBrainz
        </ExternalLink>
        <ExternalLink
          v-if="youTubeMusicUrl"
          :href="youTubeMusicUrl"
          class="track-info-link"
        >
          YouTube Music
        </ExternalLink>
        <ExternalLink
          v-if="youTubeUrl"
          :href="youTubeUrl"
          class="track-info-link"
        >
          YouTube
        </ExternalLink>
      </div>
    </div>
  </div>
</template>

<script>
  import { defineComponent, ref, computed, watch, inject } from 'vue'
  import { formatDuration } from '@/shared/utils'
  import ExternalLink from '@/shared/components/ExternalLink.vue'
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
    },

    setup: function (props) {
      var api = inject('$api')
      var album = ref(null)
      var loadingAlbum = ref(false)
      var listenBrainzUrl = ref('')
      var albumToken = 0

      var artistNames = computed(function () {
        if (!props.track || !props.track.artists) {
          return ''
        }

        return props.track.artists.map(function (artist) {
          return artist.name
        }).join(', ')
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
          listenBrainzUrl.value = ''
          loadingAlbum.value = false
          return
        }

        var token = albumToken + 1
        albumToken = token
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
        loadingAlbum: loadingAlbum,
        artistNames: artistNames,
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
    width: min(28rem, 92vw);
    max-height: 85vh;
    overflow-y: auto;
    background: var(--theme-elevation-1);
    border: 1px solid var(--theme-border);
    border-radius: var(--theme-radius-md);
    box-shadow: var(--theme-shadow-2);
    z-index: 9999;
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

  .track-info-link {
    color: var(--bs-primary);
    text-decoration: none;
    font-weight: 500;
  }

  .track-info-link:hover {
    text-decoration: underline;
  }
</style>
