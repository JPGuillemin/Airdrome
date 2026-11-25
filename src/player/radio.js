// radio.js
//
// Radio helpers: build a queue from random tracks, albums, artists or
// playlists, and extend the queue with similar tracks.

import { defineStore } from 'pinia'
import { nextTick } from 'vue'
import { sampleSize } from 'lodash-es'
import { appRouter } from '@/shared/router'
import { useLoader } from '@/shared/loader'
import { shuffled } from '@/shared/utils'
import { usePlayerStore } from '@/player/store'

/** Number of tracks a radio queues (initial queue and extensions). */
var RADIO_SIZE = 50

/**
 * @typedef {import('@/shared/api').Track} Track
 * @typedef {import('@/shared/api').Album} Album
 * @typedef {import('@/shared/api').Artist} Artist
 */

/**
 * Consume an async iterator and collect batches until `max` tracks are
 * reached or the iterator ends.
 *
 * @param {AsyncIterator<Track[]>} iterator
 * @param {number} max
 * @returns {Promise<Track[]>}
 */
async function collectArtistTracks(iterator, max) {
  var tracks = []

  while (tracks.length < max) {
    var item = await iterator.next()

    if (item.done) {
      break
    }

    tracks = tracks.concat(item.value)
  }

  return tracks
}

/**
 * Run asynchronous radio work with the global loader visible.
 *
 * @param {Object} context - `this` for the work function.
 * @param {Function} work
 * @returns {Promise<*>}
 */
async function withLoader(context, work) {
  var loader = useLoader()
  loader.showLoading()

  try {
    return await work.call(context)
  } finally {
    loader.hideLoading()
  }
}

export var useRadioStore = defineStore('radio', {
  actions: {
    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /**
     * Append tracks to `acc` without exceeding RADIO_SIZE.
     *
     * @param {Track[]} acc
     * @param {Track[]} next
     * @returns {Track[]}
     */
    takeUpToX: function(acc, next) {
      if (acc.length >= RADIO_SIZE) {
        return acc
      }

      var remaining = RADIO_SIZE - acc.length
      return acc.concat(next.slice(0, remaining))
    },

    // -----------------------------------------------------------------------
    // Core
    // -----------------------------------------------------------------------

    /**
     * Play random tracks or a provided track list.
     *
     * @param {Object} options
     * @param {Object} [options.params] - Arguments for getRandomTracks.
     * @param {Track[]} [options.tracks]
     * @returns {Promise<void>}
     */
    playRandomOrTracks: async function(options) {
      var playerStore = usePlayerStore()
      var shouldRoute = false

      await withLoader(this, async function() {
        var tracks = []

        if (options.params) {
          tracks = await this.api.getRandomTracks(options.params)
        } else if (options.tracks) {
          tracks = options.tracks
        }

        if (tracks && tracks.length) {
          await playerStore.playNow(shuffled(tracks))
          shouldRoute = true
        }
      })

      if (shouldRoute) {
        nextTick(function() {
          appRouter().push({ name: 'queue' })
        })
      }
    },

    /**
     * Return the genre of a track: explicit genre, else first album genre.
     *
     * @param {Track} track
     * @returns {Promise<string|undefined>}
     */
    resolveGenre: async function(track) {
      var direct = track.genre

      if (direct) {
        return direct
      }

      if (!track.albumId) {
        return undefined
      }

      try {
        var album = await this.api.getAlbumDetails(track.albumId)

        if (album.genres && album.genres.length) {
          return album.genres[0].name
        }

        return undefined
      } catch (error) {
        console.warn('Radio: failed to resolve album genre', error)
        return undefined
      }
    },

    /**
     * Append random tracks of the same genre to the end of the queue.
     *
     * @param {Track} track
     * @param {number} [size]
     * @returns {Promise<boolean>}
     */
    extendQueue: async function(track, size) {
      var playerStore = usePlayerStore()
      var radioSize = RADIO_SIZE

      if (size != null) {
        radioSize = size
      }

      if (!track) {
        return false
      }

      var genre = await this.resolveGenre(track)

      if (!genre) {
        console.warn('Radio: no genre found, cannot extend queue')
        return false
      }

      var random = await this.api.getRandomTracks({ genre: genre, size: radioSize })
      var queued = new Set()

      for (var i = 0; i < playerStore.queue.length; i++) {
        queued.add(playerStore.queue[i].id)
      }

      var fresh = []
      var source = random || []

      for (var j = 0; j < source.length; j++) {
        if (!queued.has(source[j].id)) {
          fresh.push(source[j])
        }
      }

      if (!fresh.length) {
        return false
      }

      playerStore.appendTracks(fresh)
      return true
    },

    // -----------------------------------------------------------------------
    // Radios
    // -----------------------------------------------------------------------

    /**
     * @param {string} genreId
     * @returns {Promise<void>}
     */
    shuffleGenre: async function(genreId) {
      await this.playRandomOrTracks({
        params: { genre: genreId, size: RADIO_SIZE }
      })
    },

    /**
     * @param {string} genreName
     * @returns {Promise<void>}
     */
    shuffleMood: async function(genreName) {
      await this.playRandomOrTracks({
        params: { genre: genreName, size: RADIO_SIZE }
      })
    },

    /**
     * @returns {Promise<void>}
     */
    luckyRadio: async function() {
      await this.playRandomOrTracks({ params: { size: RADIO_SIZE } })
    },

    /**
     * Fetch full albums and collect up to RADIO_SIZE tracks from them.
     *
     * @param {Album[]} albums
     * @returns {Promise<Track[]>}
     */
    tracksFromAlbums: async function(albums) {
      var self = this
      var tracks = []

      for (var i = 0; i < albums.length && tracks.length < RADIO_SIZE; i++) {
        var album = await self.api.getAlbumDetails(albums[i].id)

        if (album.tracks && album.tracks.length) {
          tracks = self.takeUpToX(tracks, album.tracks)
        }
      }

      return tracks
    },

    /**
     * Shuffle a radio built from albums of the given sort.
     *
     * @param {string} sort
     * @returns {Promise<void>}
     */
    shuffleAlbumSort: async function(sort) {
      await withLoader(this, async function() {
        var albums = await this.api.getAlbums(sort, 50)
        var picked = sampleSize(albums, 10)
        var tracks = await this.tracksFromAlbums(picked)

        if (tracks.length) {
          await this.playRandomOrTracks({ tracks: tracks })
        }
      })
    },

    /**
     * @returns {Promise<void>}
     */
    shuffleRecentlyPlayed: async function() {
      await this.shuffleAlbumSort('recently-played')
    },

    /**
     * @returns {Promise<void>}
     */
    shuffleRecentlyAdded: async function() {
      await this.shuffleAlbumSort('recently-added')
    },

    /**
     * @returns {Promise<void>}
     */
    shuffleMostPlayed: async function() {
      await this.shuffleAlbumSort('most-played')
    },

    /**
     * @returns {Promise<void>}
     */
    shuffleFavouriteAlbums: async function() {
      await withLoader(this, async function() {
        var favourites = await this.api.getFavourites()
        var picked = sampleSize(favourites.albums, 10)
        var tracks = []

        if (picked.length) {
          tracks = await this.tracksFromAlbums(picked)
        }

        if (tracks.length) {
          await this.playRandomOrTracks({ tracks: tracks })
        }
      })
    },

    /**
     * @returns {Promise<void>}
     */
    shuffleFavouriteArtists: async function() {
      var self = this

      await withLoader(this, async function() {
        var favourites = await self.api.getFavourites()
        var artists = sampleSize(favourites.artists, 10)
        var tracks = []

        for (var i = 0; i < artists.length && tracks.length < RADIO_SIZE; i++) {
          var iterator = self.api.getTracksByArtist(artists[i].id)
          var artistTracks = await collectArtistTracks(iterator, 20)
          tracks = tracks.concat(artistTracks.slice(0, 20))
        }

        var capped = tracks.slice(0, RADIO_SIZE)

        if (capped.length) {
          await self.playRandomOrTracks({ tracks: capped })
        }
      })
    },

    /**
     * @returns {Promise<void>}
     */
    shufflePlaylists: async function() {
      var self = this

      await withLoader(this, async function() {
        var playlists = await self.api.getPlaylists()
        var selected = playlists.slice(0, 5)
        var tracks = []

        for (var i = 0; i < selected.length && tracks.length < RADIO_SIZE; i++) {
          var playlist = await self.api.getPlaylist(selected[i].id)

          if (playlist.tracks && playlist.tracks.length) {
            tracks = self.takeUpToX(tracks, playlist.tracks)
          }
        }

        if (tracks.length) {
          await self.playRandomOrTracks({ tracks: tracks })
        }
      })
    },

    /**
     * @param {string} artistId
     * @returns {Promise<void>}
     */
    shuffleArtist: async function(artistId) {
      await withLoader(this, async function() {
        var iterator = this.api.getTracksByArtist(artistId)
        var tracks = await collectArtistTracks(iterator, RADIO_SIZE)
        await this.playRandomOrTracks({ tracks: tracks })
      })
    },

    /**
     * @param {string} artistId
     * @returns {Promise<void>}
     */
    radioArtist: async function(artistId) {
      var tracks = await this.api.getSimilarTracksByArtist(artistId, RADIO_SIZE)
      await this.playRandomOrTracks({ tracks: tracks })
    },

    /**
     * @param {Track[]} tracks
     * @param {Array<{id: string}>} artists
     * @returns {Promise<void>}
     */
    radioAlbum: async function(tracks, artists) {
      if (!tracks || !tracks.length || !artists || !artists.length) {
        return
      }

      var similarTracks = await this.api.getSimilarTracksByArtist(artists[0].id, RADIO_SIZE)

      if (similarTracks && similarTracks.length) {
        await this.playRandomOrTracks({ tracks: similarTracks })
      }
    },

    /**
     * @param {Track[]} tracks
     * @returns {Promise<void>}
     */
    shuffleAlbum: async function(tracks) {
      if (!tracks || !tracks.length) {
        return
      }

      await this.playRandomOrTracks({ tracks: tracks.slice(0, RADIO_SIZE) })
    }
  }
})
