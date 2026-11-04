// api.js
//
// Subsonic API client. Written in an explicit, ES5-friendly style:
// constructor functions, prototype methods, function expressions and
// async/await instead of promise chains.

import { inject } from 'vue'
import { orderBy, startCase, sumBy, uniqBy } from 'lodash-es'
import { toQueryString } from '@/shared/utils'

var apiSymbol = Symbol('')

/**
 * @typedef {'a-z'|'recently-added'|'recently-played'|'most-played'|'random'} AlbumSort
 */

/**
 * @typedef {Object} ArtistRef
 * @property {string} name
 * @property {string} id
 */

/**
 * @typedef {Object} ReplayGain
 * @property {number} trackGain
 * @property {number} trackPeak
 * @property {number} albumGain
 * @property {number} albumPeak
 */

/**
 * @typedef {Object} Track
 * @property {string} id
 * @property {string} title
 * @property {number} duration
 * @property {boolean} favourite
 * @property {string} [image]
 * @property {string} [url]
 * @property {number} [track]
 * @property {string} [album]
 * @property {string} [albumId]
 * @property {ArtistRef[]} artists
 * @property {boolean} [isStream]
 * @property {boolean} [isPodcast]
 * @property {boolean} [isUnavailable]
 * @property {number} [playCount]
 * @property {ReplayGain} [replayGain]
 */

/**
 * @typedef {Object} Genre
 * @property {string} id
 * @property {string} name
 * @property {number} albumCount
 * @property {number} trackCount
 */

/**
 * @typedef {Object} AlbumGenre
 * @property {string} name
 */

/**
 * @typedef {Object} Album
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {ArtistRef[]} artists
 * @property {number} year
 * @property {boolean} favourite
 * @property {AlbumGenre[]} genres
 * @property {string} [image]
 * @property {string} [lastFmUrl]
 * @property {string} [musicBrainzUrl]
 * @property {Track[]} [tracks]
 * @property {string} [releaseType]
 */

/**
 * @typedef {Object} Artist
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {AlbumGenre[]} genres
 * @property {number} albumCount
 * @property {number} trackCount
 * @property {boolean} favourite
 * @property {string} [lastFmUrl]
 * @property {string} [musicBrainzUrl]
 * @property {Track[]} [topTracks]
 * @property {Artist[]} [similarArtist]
 * @property {Album[]} [albums]
 * @property {string} [image]
 */

/**
 * @typedef {Object} SearchResult
 * @property {Artist[]} artists
 * @property {Album[]} albums
 * @property {Track[]} tracks
 */

/**
 * @typedef {Object} Playlist
 * @property {string} id
 * @property {string} name
 * @property {string} comment
 * @property {boolean} isPublic
 * @property {boolean} isReadOnly
 * @property {number} trackCount
 * @property {number} duration
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} [image]
 * @property {Track[]} [tracks]
 */

/**
 * @typedef {Object} PlayQueue
 * @property {Track[]} tracks
 * @property {number} currentTrack
 * @property {number} currentTrackPosition
 * @property {string} [changed] - Server timestamp (ISO) of the last savePlayQueue.
 * @property {string} [changedBy] - Client name (`c` param) of the device that last saved the queue.
 */

/**
 * Return the API instance provided by createApi().
 *
 * @returns {API}
 */
export function useApi() {
  return inject(apiSymbol)
}

/**
 * Create the API client and attach the Vue plugin install hook.
 *
 * @param {Object} auth
 * @returns {API}
 */
export function createApi(auth) {
  var instance = new API(auth)

  return Object.assign(instance, {
    install: function(app) {
      app.config.globalProperties.$api = instance
      app.provide(apiSymbol, instance)
    }
  })
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when a request was skipped because the browser is offline.
 *
 * @constructor
 * @extends Error
 */
export function OfflineError() {
  this.name = 'OfflineError'
  this.message = 'Offline'

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, OfflineError)
  }
}

OfflineError.prototype = Object.create(Error.prototype)
OfflineError.prototype.constructor = OfflineError

/**
 * Thrown when the server does not implement the requested operation.
 *
 * @constructor
 * @extends Error
 * @param {string} [message]
 */
export function UnsupportedOperationError(message) {
  if (message !== undefined) {
    this.message = message
  }

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, UnsupportedOperationError)
  }
}

UnsupportedOperationError.prototype = Object.create(Error.prototype)
UnsupportedOperationError.prototype.constructor = UnsupportedOperationError

/**
 * Thrown when Subsonic answers with a non-ok status.
 *
 * @constructor
 * @extends Error
 * @param {string} message
 * @param {string|null} code
 */
export function SubsonicError(message, code) {
  this.name = 'SubsonicError'
  this.message = message
  this.code = code

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, SubsonicError)
  }
}

SubsonicError.prototype = Object.create(Error.prototype)
SubsonicError.prototype.constructor = SubsonicError

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Create the API client.
 *
 * @constructor
 * @param {Object} auth
 */
export function API(auth) {
  var self = this

  this.auth = auth
  this.clientName = 'Airdrome'

  /**
   * Stable per-install ID, used to tell devices apart in getPlayQueue().changedBy.
   *
   * @type {string}
   */
  this.deviceId = (function() {
    var key = 'airdrome.deviceId'
    var id = localStorage.getItem(key)

    if (!id) {
      var generated = undefined

      if (crypto.randomUUID) {
        generated = crypto.randomUUID().slice(0, 8)
      }

      if (generated == null) {
        generated = Math.random().toString(36).slice(2, 10)
      }

      id = generated
      localStorage.setItem(key, id)
    }

    return id
  })()

  // Simple in-memory cache for the full artist list. It's fetched by
  // getArtists() (artist library page) and reused by getArtistsByGenre()
  // (genre pages) so genre browsing doesn't re-fetch the whole library
  // on every request. TTL keeps it from going stale for too long; call
  // clearArtistsCache() after actions that could change it sooner
  // (e.g. a library rescan, or an artist being favourited).

  /**
   * @type {{data: Artist[], expiresAt: number}|null}
   */
  this.artistsCache = null

  /** @type {number} */
  this.artistsCacheTtlMs = 5 * 60 * 1000 // 5 minutes

  /**
   * @param {string} path
   * @param {Object} [params]
   * @returns {Promise<Object>}
   */
  this.fetch = async function(path, params) {
    params = Object.assign(
      { v: '1.16.1', f: 'json', c: self.clientName },
      params
    )

    var request

    if (self.auth.serverInfo && self.auth.serverInfo.extensions.includes('formPost')) {
      request = new Request(self.auth.server + '/' + path, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: toQueryString(params) + '&' + self.auth.urlParams
      })
    } else {
      request = new Request(
        self.auth.server + '/' + path + '?' + toQueryString(params) + '&' + self.auth.urlParams,
        { method: 'GET', headers: { Accept: 'application/json' } }
      )
    }

    try {
      var response = await window.fetch(request)

      if (!response.ok) {
        if (response.status === 501) {
          throw new UnsupportedOperationError(
            'Request failed with status ' + response.status
          )
        }

        throw new Error('Request failed with status ' + response.status)
      }

      var json = await response.json()
      var subsonicResponse = json['subsonic-response']

      if (subsonicResponse.status !== 'ok') {
        var errorMessage = subsonicResponse.status
        var errorCode = null

        if (subsonicResponse.error) {
          if (subsonicResponse.error.message) {
            errorMessage = subsonicResponse.error.message
          }

          if (subsonicResponse.error.code != null) {
            errorCode = subsonicResponse.error.code
          }
        }

        throw new SubsonicError(errorMessage, errorCode)
      }

      return subsonicResponse
    } catch (err) {
      if (err instanceof TypeError && !navigator.onLine) {
        console.info('[Offline mode] API request skipped:', path)
        throw new OfflineError()
      }

      throw err
    }
  }
}

/**
 * Client name sent with savePlayQueue; Navidrome echoes it back as `changedBy`.
 *
 * @type {string}
 */
Object.defineProperty(API.prototype, 'sessionClient', {
  configurable: true,
  enumerable: false,
  get: function() {
    return this.clientName + '-' + this.deviceId
  }
})

/**
 * True if the play queue was last written by this device, or if the writer is
 * unknown / a legacy build without a device id (never treated as a takeover).
 *
 * @param {string} [changedBy]
 * @returns {boolean}
 */
API.prototype.isOwnQueueWriter = function(changedBy) {
  return !changedBy || changedBy === this.sessionClient || changedBy === this.clientName
}

// ---------------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<boolean>}
 */
API.prototype.isOnline = async function() {
  try {
    var response = await this.fetch('rest/ping.view', {})

    if (!response) {
      return false
    }

    return response.status === 'ok'
  } catch (err) {
    if (err instanceof OfflineError) {
      return false
    }

    return false
  }
}

// ---------------------------------------------------------------------------
// Genres
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<Genre[]>}
 */
API.prototype.getGenres = async function() {
  var response = await this.fetch('rest/getGenres', {})
  var items = (response.genres && response.genres.genre) || []
  var genres = items.map(function(item) {
    var albumCount = 0
    var trackCount = 0

    if (item.albumCount != null) {
      albumCount = item.albumCount
    }

    if (item.songCount != null) {
      trackCount = item.songCount
    }

    return {
      id: item.value,
      name: item.value,
      albumCount: albumCount,
      trackCount: trackCount
    }
  })

  genres.sort(function(a, b) {
    return b.albumCount - a.albumCount
  })

  return genres
}

/**
 * @param {string} id
 * @param {number} size
 * @param {number} [offset]
 * @param {boolean} [random]
 * @returns {Promise<Album[]>}
 */
API.prototype.getAlbumsByGenre = async function(id, size, offset, random) {
  if (offset === undefined) {
    offset = 0
  }

  if (random === undefined) {
    random = false
  }

  var params = {
    type: 'byGenre',
    genre: id,
    size: size,
    offset: offset
  }
  var response = await this.fetch('rest/getAlbumList2', params)
  var rawAlbums = (response.albumList2 && response.albumList2.album) || []
  var albums = rawAlbums.map(this.normalizeAlbum, this)

  if (!random) {
    return albums
  }

  // Fisher-Yates shuffle (in-place)
  for (var i = albums.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1))
    var temporary = albums[i]
    albums[i] = albums[j]
    albums[j] = temporary
  }

  return albums
}

/**
 * @param {string} genre
 * @param {number} size
 * @param {number} [offset]
 * @returns {Promise<Artist[]>}
 */
API.prototype.getArtistsByGenre = async function(genre, size, offset) {
  if (offset === undefined) {
    offset = 0
  }

  // Fetch all albums for the genre to get accurate artist counts and proper pagination
  // We need to fetch enough albums to cover all artists up to offset + size
  var fetchSize = Math.max(500, (offset + size) * 10)

  // Fetch the real artist list in parallel so we can look up each artist's
  // *own* image (avoids falling back to an arbitrary album cover below)
  var results = await Promise.all([
    this.fetch('rest/getAlbumList2', {
      type: 'byGenre',
      genre: genre,
      size: fetchSize,
      offset: 0
    }),
    this.getArtists()
  ])

  var response = results[0]
  var allArtists = results[1]

  var artistImageMap = new Map()

  for (var i = 0; i < allArtists.length; i++) {
    artistImageMap.set(allArtists[i].id, allArtists[i].image)
  }

  var rawAlbums = (response.albumList2 && response.albumList2.album) || []

  /**
   * @type {Map<string, {id: string, name: string, albumCount: number, image: (string|undefined)}>}
   */
  var artistMap = new Map()

  // Process raw album data to use AlbumArtist (or fallback to Artist)
  for (var j = 0; j < rawAlbums.length; j++) {
    var album = rawAlbums[j]

    // Prefer albumArtist over artist for proper genre grouping
    var artistId = album.albumArtistId || album.artistId
    var artistName = album.albumArtist || album.artist

    if (!artistId || !artistName) {
      continue
    }

    var existing = artistMap.get(artistId)

    if (!existing) {
      artistMap.set(artistId, {
        id: artistId,
        name: artistName,
        albumCount: 1,
        image: artistImageMap.get(artistId)
      })
    } else {
      existing.albumCount += 1
    }
  }

  // Sort by album count and apply offset/size to the artist list, not album list
  var sortedArtists = Array.from(artistMap.values())

  sortedArtists.sort(function(a, b) {
    return b.albumCount - a.albumCount
  })

  var page = sortedArtists.slice(offset, offset + size)
  var artists = []

  for (var k = 0; k < page.length; k++) {
    var artist = page[k]

    artists.push({
      id: artist.id,
      name: artist.name,
      description: '',
      genres: [{ name: genre }],
      albumCount: artist.albumCount,
      trackCount: 0,
      favourite: false,
      image: artist.image
    })
  }

  return artists
}

/**
 * @param {string} id
 * @param {number} size
 * @param {number} [offset]
 * @returns {Promise<Track[]>}
 */
API.prototype.getTracksByGenre = async function(id, size, offset) {
  if (offset === undefined) {
    offset = 0
  }

  var params = {
    genre: id,
    count: size,
    offset: offset
  }
  var response = await this.fetch('rest/getSongsByGenre', params)
  var songs = (response.songsByGenre && response.songsByGenre.song) || []

  return songs.map(this.normalizeTrack, this)
}

/**
 * @param {string} id
 * @param {number} [size]
 * @returns {Promise<Track[]>}
 */
API.prototype.getSimilarTracksByArtist = async function(id, size) {
  if (size === undefined) {
    size = 50
  }

  var artist = await this.getArtistDetails(id)
  var albums = artist.albums || []

  if (!albums.length) {
    return []
  }

  var genreWeightMap = {}

  for (var i = 0; i < albums.length; i++) {
    var genres = albums[i].genres || []

    for (var j = 0; j < genres.length; j++) {
      var name = genres[j].name
      genreWeightMap[name] = (genreWeightMap[name] || 0) + 1
    }
  }

  var weightedGenres = []
  var genreNames = Object.keys(genreWeightMap)

  for (var k = 0; k < genreNames.length; k++) {
    var count = genreWeightMap[genreNames[k]]

    for (var n = 0; n < count; n++) {
      weightedGenres.push(genreNames[k])
    }
  }

  if (!weightedGenres.length) {
    return []
  }

  var chosenGenre = weightedGenres[Math.floor(Math.random() * weightedGenres.length)]

  return this.getRandomTracks({ genre: chosenGenre, size: size })
}

// ---------------------------------------------------------------------------
// Artists
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<Artist[]>}
 */
API.prototype.getArtists = async function() {
  if (this.artistsCache && this.artistsCache.expiresAt > Date.now()) {
    return this.artistsCache.data
  }

  var response = await this.fetch('rest/getArtists')
  var indexes = (response.artists && response.artists.index) || []
  var artists = indexes
    .flatMap(function(index) {
      return index.artist
    })
    .map(this.normalizeArtist, this)

  this.artistsCache = {
    data: artists,
    expiresAt: Date.now() + this.artistsCacheTtlMs
  }

  return artists
}

// Call after anything that could change the artist list sooner than the
// TTL would naturally expire it (library rescan, artist favourited, etc.)
/**
 * @returns {void}
 */
API.prototype.clearArtistsCache = function() {
  this.artistsCache = null
}

/**
 * @param {string} id
 * @returns {Promise<Artist>}
 */
API.prototype.getArtistDetails = async function(id) {
  var info2Promise = this.fetch('rest/getArtistInfo2', { id: id })
  var artistResponse = await this.fetch('rest/getArtist', { id: id })
  var artist = artistResponse.artist
  var topSongsResponse = await this.fetch('rest/getTopSongs', { artist: artist.name })
  var topSongs = undefined

  if (topSongsResponse.topSongs != null) {
    topSongs = topSongsResponse.topSongs.song
  }

  var info2Response = await info2Promise
  var info2 = info2Response.artistInfo2

  return this.normalizeArtist(
    Object.assign({}, info2, artist, { album: artist.album, topSongs: topSongs })
  )
}

/**
 * @param {string} id
 * @returns {AsyncGenerator<Track[]>}
 */
API.prototype.getTracksByArtist = async function*(id) {
  var self = this
  var artistResponse = await this.fetch('rest/getArtist', { id: id })
  var artist = artistResponse.artist
  var albumList = artist.album || []
  var ordered = orderBy(albumList, function(x) {
    return x.year || 0
  }, 'desc')
  var albumIds = ordered.map(function(x) {
    return x.id
  })

  // Keep a small sliding window of in-flight album requests instead of
  // firing every album at once (each getAlbumDetails is 2 HTTP calls).
  var CONCURRENCY = 3
  var pending = new Map()
  var nextToStart = 0

  function startNext() {
    if (nextToStart >= albumIds.length) {
      return
    }

    var index = nextToStart
    nextToStart += 1
    pending.set(index, self.getAlbumDetails(albumIds[index]))
  }

  for (var i = 0; i < CONCURRENCY; i++) {
    startNext()
  }

  for (var j = 0; j < albumIds.length; j++) {
    var album = await pending.get(j)
    pending.delete(j)
    startNext()

    if (album.tracks && album.tracks.length) {
      yield album.tracks
    }
  }
}

/**
 * @param {string} id
 * @returns {Promise<Album>}
 */
API.prototype.getAlbumDetails = async function(id) {
  var params = { id: id }
  var results = await Promise.all([
    this.fetch('rest/getAlbum', params),
    this.fetch('rest/getAlbumInfo2', params)
  ])

  var info = results[0]
  var info2 = results[1]

  return this.normalizeAlbum(Object.assign({}, info.album, info2.albumInfo))
}

// ---------------------------------------------------------------------------
// Albums
// ---------------------------------------------------------------------------

/**
 * @param {AlbumSort} sort
 * @param {number} size
 * @param {number} [offset]
 * @returns {Promise<Album[]>}
 */
API.prototype.getAlbums = async function(sort, size, offset) {
  if (offset === undefined) {
    offset = 0
  }

  var types = {
    'a-z': 'alphabeticalByName',
    'recently-added': 'newest',
    'recently-played': 'recent',
    'most-played': 'frequent',
    random: 'random'
  }
  var type = types[sort]

  var params = { type: type, offset: offset, size: size }
  var response = await this.fetch('rest/getAlbumList2', params)
  var albums = (response.albumList2 && response.albumList2.album) || []

  return albums.map(this.normalizeAlbum, this)
}

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<Playlist[]>}
 */
API.prototype.getPlaylists = async function() {
  var response = await this.fetch('rest/getPlaylists')
  var playlists = (response.playlists && response.playlists.playlist) || []

  return playlists.map(this.normalizePlaylist, this)
}

/**
 * @param {string} id
 * @returns {Promise<Playlist>}
 */
API.prototype.getPlaylist = async function(id) {
  if (id === 'random') {
    var randomTracks = await this.getRandomTracks()
    var duration = sumBy(randomTracks, 'duration')

    return {
      id: id,
      name: 'Random',
      comment: '',
      createdAt: '',
      updatedAt: '',
      tracks: randomTracks,
      trackCount: randomTracks.length,
      duration: duration,
      isPublic: false,
      isReadOnly: true
    }
  }

  var response = await this.fetch('rest/getPlaylist', { id: id })
  var playlist = this.normalizePlaylist(response.playlist)

  playlist.tracks = (response.playlist.entry || []).map(this.normalizeTrack, this)

  return playlist
}

/**
 * @param {string} name
 * @param {string[]} [tracks]
 * @returns {Promise<Playlist[]>}
 */
API.prototype.createPlaylist = async function(name, tracks) {
  await this.fetch('rest/createPlaylist', { name: name, songId: tracks })

  return this.getPlaylists()
}

/**
 * @param {string} playlistId
 * @param {string} name
 * @param {string} comment
 * @param {boolean} isPublic
 * @returns {Promise<void>}
 */
API.prototype.editPlaylist = async function(playlistId, name, comment, isPublic) {
  var params = {
    playlistId: playlistId,
    name: name,
    comment: comment,
    public: isPublic
  }

  await this.fetch('rest/updatePlaylist', params)
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
API.prototype.deletePlaylist = async function(id) {
  await this.fetch('rest/deletePlaylist', { id: id })
}

/**
 * @param {string} playlistId
 * @param {string[]} tracks
 * @returns {Promise<void>}
 */
API.prototype.addToPlaylist = async function(playlistId, tracks) {
  var params = {
    playlistId: playlistId,
    songIdToAdd: tracks
  }

  await this.fetch('rest/updatePlaylist', params)
}

/**
 * @param {string} playlistId
 * @param {number} index
 * @returns {Promise<void>}
 */
API.prototype.removeFromPlaylist = async function(playlistId, index) {
  var params = {
    playlistId: playlistId,
    songIndexToRemove: index
  }

  await this.fetch('rest/updatePlaylist', params)
}

// ---------------------------------------------------------------------------
// Play queue
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<PlayQueue>}
 */
API.prototype.getPlayQueue = async function() {
  // `_` makes every URL unique so no HTTP cache or service worker can serve a stale queue
  var response = await this.fetch('rest/getPlayQueue', { _: Date.now() })
  var playQueue = response.playQueue
  var entries = []

  if (playQueue && playQueue.entry) {
    entries = playQueue.entry
  }

  var tracks = entries.map(this.normalizeTrack, this)
  var currentTrackId = undefined

  if (playQueue && playQueue.current != null) {
    currentTrackId = playQueue.current.toString()
  }

  var index = tracks.findIndex(function(track) {
    return track.id === currentTrackId
  })
  var currentTrack = 0

  if (index >= 0) {
    currentTrack = index
  }

  var position = (playQueue && playQueue.position) || 0
  var changed = undefined
  var changedBy = undefined

  if (playQueue) {
    changed = playQueue.changed
    changedBy = playQueue.changedBy
  }

  return {
    tracks: tracks,
    currentTrack: currentTrack,
    currentTrackPosition: position / 1000,
    changed: changed,
    changedBy: changedBy
  }
}

/**
 * Resolves true when the queue was written, false when the error was swallowed (offline etc.).
 *
 * @param {Track[]} tracks
 * @param {Track|null} currentTrack
 * @param {number|null} currentTime
 * @returns {Promise<boolean>}
 */
API.prototype.savePlayQueue = async function(tracks, currentTrack, currentTime) {
  try {
    var tracksIds = tracks
      .filter(function(track) {
        return !track.isStream
      })
      .map(function(track) {
        return track.id
      })

    var currentId = undefined

    if (currentTrack && !currentTrack.isStream) {
      currentId = currentTrack.id
    }

    var position = undefined

    if (currentTime != null) {
      position = Math.round(currentTime * 1000)
    }

    await this.fetch('rest/savePlayQueue', {
      c: this.sessionClient, // identifies this device in getPlayQueue().changedBy
      id: tracksIds,
      current: currentId,
      position: position
    })

    return true
  } catch (err) {
    if (err instanceof OfflineError) {
      return false
    }

    if (err.code === 0 || err.code === 10) {
      return false
    }

    throw err
  }
}

// ---------------------------------------------------------------------------
// Random tracks
// ---------------------------------------------------------------------------

/**
 * @param {Object} [options]
 * @param {number} [options.size]
 * @param {string} [options.genre]
 * @param {number} [options.fromYear]
 * @param {number} [options.toYear]
 * @returns {Promise<Track[]>}
 */
API.prototype.getRandomTracks = async function(options) {
  var settings = options

  if (settings === undefined) {
    settings = {}
  }

  var size = settings.size
  var genre = settings.genre
  var fromYear = settings.fromYear
  var toYear = settings.toYear

  if (size === undefined) {
    size = 200
  }

  var params = {
    size: size
  }

  if (genre !== undefined) {
    params.genre = genre
  }

  if (fromYear !== undefined) {
    params.fromYear = fromYear
  }

  if (toYear !== undefined) {
    params.toYear = toYear
  }

  var response = await this.fetch('rest/getRandomSongs', params)
  var songs = (response.randomSongs && response.randomSongs.song) || []

  return songs.map(this.normalizeTrack, this)
}

// ---------------------------------------------------------------------------
// Favourites and history
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<{albums: Album[], artists: Artist[], tracks: Track[]}>}
 */
API.prototype.getFavourites = async function() {
  var response = await this.fetch('rest/getStarred2')
  var starred = response.starred2

  return {
    albums: ((starred && starred.album) || []).map(this.normalizeAlbum, this),
    artists: ((starred && starred.artist) || []).map(this.normalizeArtist, this),
    tracks: ((starred && starred.song) || []).map(this.normalizeTrack, this)
  }
}

/**
 * @param {number} [size]
 * @returns {Promise<Track[]>}
 */
API.prototype.getRecentlyPlayedTracks = async function(size) {
  if (size === undefined) {
    size = 200
  }

  var albums = await this.getAlbums('recently-played', size)

  return albums.flatMap(function(album) {
    return album.tracks || []
  })
}

/**
 * @param {string} id
 * @param {string} type
 * @returns {Promise<void>}
 */
API.prototype.addFavourite = async function(id, type) {
  var params = {
    id: undefined,
    albumId: undefined,
    artistId: undefined
  }

  if (type === 'track') {
    params.id = id
  } else if (type === 'album') {
    params.albumId = id
  } else if (type === 'artist') {
    params.artistId = id
  }

  await this.fetch('rest/star', params)
}

/**
 * @param {string} id
 * @param {string} type
 * @returns {Promise<void>}
 */
API.prototype.removeFavourite = async function(id, type) {
  var params = {
    id: undefined,
    albumId: undefined,
    artistId: undefined
  }

  if (type === 'track') {
    params.id = id
  } else if (type === 'album') {
    params.albumId = id
  } else if (type === 'artist') {
    params.artistId = id
  }

  await this.fetch('rest/unstar', params)
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * @param {string} query
 * @param {string|null} type
 * @param {number} size
 * @param {number} [offset]
 * @returns {Promise<SearchResult>}
 */
API.prototype.search = async function(query, type, size, offset) {
  var albumCount = 0
  var artistCount = 0
  var songCount = 0

  if (!type || type === 'album') {
    albumCount = size
  }

  if (!type || type === 'artist') {
    artistCount = size
  }

  if (!type || type === 'track') {
    songCount = size
  }

  var albumOffset = 0
  var artistOffset = 0
  var songOffset = 0

  if (offset != null) {
    albumOffset = offset
    artistOffset = offset
    songOffset = offset
  }

  var params = {
    query: query,
    albumCount: albumCount,
    artistCount: artistCount,
    songCount: songCount,
    albumOffset: albumOffset,
    artistOffset: artistOffset,
    songOffset: songOffset
  }
  var data = await this.fetch('rest/search3', params)

  return {
    albums: (data.searchResult3.album || []).map(this.normalizeAlbum, this),
    artists: (data.searchResult3.artist || []).map(this.normalizeArtist, this),
    tracks: (data.searchResult3.song || []).map(this.normalizeTrack, this)
  }
}

// ---------------------------------------------------------------------------
// Library scan and scrobbling
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<void>}
 */
API.prototype.scan = async function() {
  return this.fetch('rest/startScan')
}

/**
 * @returns {Promise<boolean>}
 */
API.prototype.getScanStatus = async function() {
  var response = await this.fetch('rest/getScanStatus')

  return response.scanStatus.scanning
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
API.prototype.scrobble = async function(id) {
  try {
    await this.fetch('rest/scrobble', { id: id, submission: true })
  } catch (err) {
    if (err instanceof OfflineError) {
      return
    }

    throw err
  }
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * @param {Object} item
 * @returns {Track}
 */
API.prototype.normalizeTrack = function(item) {
  var replayGain = null
  var rawReplayGain = item.replayGain

  if (
    rawReplayGain &&
    Number.isFinite(rawReplayGain.trackGain) &&
    Number.isFinite(rawReplayGain.albumGain) &&
    rawReplayGain.trackPeak > 0 &&
    rawReplayGain.albumPeak > 0
  ) {
    replayGain = rawReplayGain
  }

  var artists = [{ id: item.artistId, name: item.artist }]

  if (item.artists && item.artists.length) {
    artists = item.artists
  }

  var image = undefined

  if (item.albumId) {
    image = this.getCoverArtUrl({ coverArt: item.albumId })
  } else {
    image = this.getCoverArtUrl(item)
  }

  return {
    id: item.id,
    title: item.title,
    duration: item.duration,
    favourite: !!item.starred,
    track: item.track,
    album: item.album,
    albumId: item.albumId,
    artists: artists,
    url: this.getStreamUrl(item.id),
    image: image,
    replayGain: replayGain
  }
}

/**
 * @param {Object} item
 * @returns {AlbumGenre[]}
 */
API.prototype.normalizeGenres = function(item) {
  if (item.genres && item.genres.length) {
    return item.genres
  }

  if (item.genre) {
    return [{ name: item.genre }]
  }

  return []
}

/**
 * @param {Object} item
 * @returns {Album}
 */
API.prototype.normalizeAlbum = function(item) {
  var artists = [{ id: item.artistId, name: item.artist }]

  if (item.artists && item.artists.length) {
    artists = item.artists
  }

  var musicBrainzUrl = undefined

  if (item.musicBrainzId) {
    musicBrainzUrl = 'https://listenbrainz.org/album/' + item.musicBrainzId
  }

  return {
    id: item.id,
    name: item.name,
    description: (item.notes || '').replace(/<a[^>]*>.*?<\/a>/gm, ''),
    artists: artists,
    image: this.getCoverArtUrl(item),
    year: item.year || 0,
    favourite: !!item.starred,
    genres: this.normalizeGenres(item),
    lastFmUrl: item.lastFmUrl,
    musicBrainzUrl: musicBrainzUrl,
    tracks: (item.song || []).map(this.normalizeTrack, this),
    releaseType: this.normalizeReleaseType(item)
  }
}

/**
 * @param {Object} item
 * @returns {string}
 */
API.prototype.normalizeReleaseType = function(item) {
  if (item.isCompilation) {
    return 'COMPILATION'
  }

  if (!item.releaseTypes || !item.releaseTypes.length || item.releaseTypes[0] === '') {
    return 'ALBUM'
  }

  var value = item.releaseTypes[0].toUpperCase()
  var known = ['ALBUM', 'EP', 'SINGLE', 'COMPILATION']

  if (known.indexOf(value) !== -1) {
    return value
  }

  return startCase(item.releaseTypes[0].toLowerCase())
}

/**
 * @param {Object} item
 * @returns {Artist}
 */
API.prototype.normalizeArtist = function(item) {
  var rawAlbums = []

  if (item.album) {
    if (Array.isArray(item.album)) {
      rawAlbums = item.album
    } else {
      rawAlbums = [item.album]
    }
  }

  function getAlbumTime(album) {
    var released = NaN

    if (album && album.released) {
      released = Date.parse(album.released)
    }

    if (!isNaN(released)) {
      return released
    }

    var year = NaN

    if (album) {
      year = Number(album.year)
    }

    if (!isNaN(year)) {
      return new Date(year, 0, 1).getTime()
    }

    return Number.MIN_SAFE_INTEGER
  }

  var sortedAlbums = rawAlbums.slice()

  sortedAlbums.sort(function(a, b) {
    return getAlbumTime(b) - getAlbumTime(a)
  })

  var musicBrainzUrl = undefined

  if (item.musicBrainzId) {
    musicBrainzUrl = 'https://listenbrainz.org/artist/' + item.musicBrainzId
  }

  var image = undefined

  if (item.coverArt) {
    image = this.getCoverArtUrl(item)
  } else {
    image = item.artistImageUrl
  }

  var trackCount = rawAlbums.reduce(function(acc, album) {
    return acc + (album.songCount || 0)
  }, 0)

  return {
    id: item.id,
    name: item.name,
    description: (item.biography || '').replace(/<a[^>]*>.*?<\/a>/gm, ''),
    genres: uniqBy(sortedAlbums.flatMap(this.normalizeGenres, this), 'name'),
    albumCount: item.albumCount,
    trackCount: trackCount,
    favourite: !!item.starred,
    lastFmUrl: item.lastFmUrl,
    musicBrainzUrl: musicBrainzUrl,
    albums: sortedAlbums.map(this.normalizeAlbum, this),
    similarArtist: (item.similarArtist || []).map(this.normalizeArtist, this),
    topTracks: (item.topSongs || []).slice(0, 5).map(this.normalizeTrack, this),
    image: image
  }
}

/**
 * @param {Object} response
 * @returns {Playlist}
 */
API.prototype.normalizePlaylist = function(response) {
  var image = undefined

  if (response.songCount > 0) {
    image = this.getCoverArtUrl(response)
  }

  return {
    id: response.id,
    name: response.name || '(Unnamed)',
    comment: response.comment || '',
    createdAt: response.created || '',
    updatedAt: response.changed || '',
    trackCount: response.songCount,
    duration: response.duration,
    image: image,
    isPublic: response.public,
    isReadOnly: false
  }
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/**
 * @param {string} id
 * @returns {string}
 */
API.prototype.getDownloadUrl = function(id) {
  var server = this.auth.server
  var urlParams = this.auth.urlParams

  return server + '/rest/download' +
    '?id=' + id +
    '&v=1.16.1' +
    '&' + urlParams +
    '&c=' + this.clientName
}

/**
 * @param {Object} item
 * @returns {string|undefined}
 */
API.prototype.getCoverArtUrl = function(item) {
  if (!item.coverArt) {
    return undefined
  }

  var server = this.auth.server
  var urlParams = this.auth.urlParams

  return server + '/rest/getCoverArt' +
    '?id=' + item.coverArt +
    '&v=1.16.1' +
    '&' + urlParams +
    '&c=' + this.clientName +
    '&size=300'
}

/**
 * @param {string} id
 * @returns {string}
 */
API.prototype.getStreamUrl = function(id) {
  var server = this.auth.server
  var urlParams = this.auth.urlParams
  var storedQuality = Number(localStorage.getItem('streamQuality'))
  var bitRate = 128
  var audioCodec = localStorage.getItem('audioCodec') || 'mp3'

  if (Number.isFinite(storedQuality) && storedQuality > 0) {
    bitRate = storedQuality
  }

  if (bitRate === 1000) {
    audioCodec = 'raw'
    bitRate = 0
  }

  return server + '/rest/stream' +
    '?id=' + id +
    '&v=1.16.1' +
    '&' + urlParams +
    '&maxBitRate=' + bitRate +
    '&format=' + audioCodec +
    '&c=' + this.clientName
}
