// radio.js
//
// Radio helpers: build a queue from random tracks, albums, artists or
// playlists, and extend the queue with similar tracks.

import { defineStore } from 'pinia'
import { nextTick } from 'vue'
import { appRouter } from '@/shared/router'
import { useLoader } from '@/shared/loader'
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

  async function step() {
    var item = await iterator.next()

    if (item.done) {
      return tracks
    }

    tracks = tracks.concat(item.value)

    if (tracks.length >= max) {
      return tracks
    }

    return step()
  }

  return step()
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

    /**
     * Return a shuffled copy of a track list.
     *
     * @param {Track[]} tracks
     * @returns {Track[]}
     */
    shuffleTracks: function(tracks) {
      var copy = tracks.slice()

      for (var i = copy.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1))
        var temporary = copy[i]
        copy[i] = copy[j]
        copy[j] = temporary
      }

      return copy
    },

    /**
     * Pick up to `count` random items from an array.
     *
     * @param {Array} arr
     * @param {number} count
     * @returns {Array}
     */
    pickRandom: function(arr, count) {
      var copy = arr.slice()
      var result = []

      while (result.length < count && copy.length) {
        var index = Math.floor(Math.random() * copy.length)
        result.push(copy.splice(index, 1)[0])
      }

      return result
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
      var loader = useLoader()
      var playerStore = usePlayerStore()
      var shouldRoute = false

      loader.showLoading()

      try {
        var tracks

        if (options.params) {
          tracks = await this.api.getRandomTracks(options.params)
        } else if (options.tracks) {
          tracks = options.tracks
        } else {
          tracks = []
        }

        if (tracks && tracks.length) {
          var randomized = this.shuffleTracks(tracks)
          await playerStore.playNow(randomized)
          shouldRoute = true
        }
      } catch (error) {
        loader.hideLoading()
        throw error
      }

      loader.hideLoading()

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

      async function next(index) {
        if (index >= albums.length || tracks.length >= RADIO_SIZE) {
          return tracks
        }

        var album = await self.api.getAlbumDetails(albums[index].id)

        if (album.tracks && album.tracks.length) {
          tracks = self.takeUpToX(tracks, album.tracks)
        }

        return next(index + 1)
      }

      return next(0)
    },

    /**
     * Shuffle a radio built from albums of the given sort.
     *
     * @param {string} sort
     * @returns {Promise<void>}
     */
    shuffleAlbumSort: async function(sort) {
      var loader = useLoader()
      loader.showLoading()

      try {
        var albums = await this.api.getAlbums(sort, 50)
        var picked = this.pickRandom(albums, 10)
        var tracks = await this.tracksFromAlbums(picked)

        if (tracks.length) {
          await this.playRandomOrTracks({ tracks: tracks })
        }
      } catch (error) {
        loader.hideLoading()
        throw error
      }

      loader.hideLoading()
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
      var loader = useLoader()
      loader.showLoading()

      try {
        var favourites = await this.api.getFavourites()
        var picked = this.pickRandom(favourites.albums, 10)
        var tracks = []

        if (picked.length) {
          tracks = await this.tracksFromAlbums(picked)
        }

        if (tracks.length) {
          await this.playRandomOrTracks({ tracks: tracks })
        }
      } catch (error) {
        loader.hideLoading()
        throw error
      }

      loader.hideLoading()
    },

    /**
     * @returns {Promise<void>}
     */
    shuffleFavouriteArtists: async function() {
      var self = this
      var loader = useLoader()
      loader.showLoading()

      try {
        var favourites = await this.api.getFavourites()
        var artists = this.pickRandom(favourites.artists, 10)
        var tracks = []

        if (artists.length) {
          async function next(index) {
            if (index >= artists.length || tracks.length >= RADIO_SIZE) {
              return tracks
            }

            var iterator = self.api.getTracksByArtist(artists[index].id)
            var artistTracks = await collectArtistTracks(iterator, 20)
            tracks = tracks.concat(artistTracks.slice(0, 20))
            return next(index + 1)
          }

          tracks = await next(0)
        }

        var capped = tracks.slice(0, RADIO_SIZE)

        if (capped.length) {
          await self.playRandomOrTracks({ tracks: capped })
        }
      } catch (error) {
        loader.hideLoading()
        throw error
      }

      loader.hideLoading()
    },

    /**
     * @returns {Promise<void>}
     */
    shufflePlaylists: async function() {
      var self = this
      var loader = useLoader()
      loader.showLoading()

      try {
        var playlists = await this.api.getPlaylists()
        var selected = playlists.slice(0, 5)
        var tracks = []

        async function next(index) {
          if (index >= selected.length || tracks.length >= RADIO_SIZE) {
            return tracks
          }

          var playlist = await self.api.getPlaylist(selected[index].id)

          if (playlist.tracks && playlist.tracks.length) {
            tracks = self.takeUpToX(tracks, playlist.tracks)
          }

          return next(index + 1)
        }

        tracks = await next(0)

        if (tracks.length) {
          await self.playRandomOrTracks({ tracks: tracks })
        }
      } catch (error) {
        loader.hideLoading()
        throw error
      }

      loader.hideLoading()
    },

    /**
     * @param {string} artistId
     * @returns {Promise<void>}
     */
    shuffleArtist: async function(artistId) {
      var loader = useLoader()
      loader.showLoading()

      var iterator = this.api.getTracksByArtist(artistId)

      try {
        var tracks = await collectArtistTracks(iterator, RADIO_SIZE)
        await this.playRandomOrTracks({ tracks: tracks })
      } catch (error) {
        loader.hideLoading()
        throw error
      }

      loader.hideLoading()
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
