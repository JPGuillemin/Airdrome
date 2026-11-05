// shared/api/library.js
//
// Library browsing, search, favourites, library scans and scrobbling.
// Written in an explicit, ES5-friendly style: var, function expressions and
// async/await instead of promise chains.

import { orderBy } from 'lodash-es'
import { OfflineError } from './client'

export var libraryMethods = {
  // -------------------------------------------------------------------------
  // Genres
  // -------------------------------------------------------------------------

  /**
   * @returns {Promise<Genre[]>}
   */
  getGenres: async function() {
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
  },

  /**
   * @param {string} id
   * @param {number} size
   * @param {number} [offset]
   * @param {boolean} [random]
   * @returns {Promise<Album[]>}
   */
  getAlbumsByGenre: async function(id, size, offset, random) {
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
  },

  /**
   * @param {string} genre
   * @param {number} size
   * @param {number} [offset]
   * @returns {Promise<Artist[]>}
   */
  getArtistsByGenre: async function(genre, size, offset) {
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
  },

  /**
   * @param {string} id
   * @param {number} size
   * @param {number} [offset]
   * @returns {Promise<Track[]>}
   */
  getTracksByGenre: async function(id, size, offset) {
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
  },

  /**
   * @param {string} id
   * @param {number} [size]
   * @returns {Promise<Track[]>}
   */
  getSimilarTracksByArtist: async function(id, size) {
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
  },

  // -------------------------------------------------------------------------
  // Artists
  // -------------------------------------------------------------------------

  /**
   * @returns {Promise<Artist[]>}
   */
  getArtists: async function() {
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
  },

  /**
   * @param {string} id
   * @returns {Promise<Artist>}
   */
  getArtistDetails: async function(id) {
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
  },

  /**
   * @param {string} id
   * @returns {AsyncGenerator<Track[]>}
   */
  getTracksByArtist: async function*(id) {
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
  },

  /**
   * @param {string} id
   * @returns {Promise<Album>}
   */
  getAlbumDetails: async function(id) {
    var params = { id: id }
    var results = await Promise.all([
      this.fetch('rest/getAlbum', params),
      this.fetch('rest/getAlbumInfo2', params)
    ])

    var info = results[0]
    var info2 = results[1]

    return this.normalizeAlbum(Object.assign({}, info.album, info2.albumInfo))
  },

  // -------------------------------------------------------------------------
  // Albums
  // -------------------------------------------------------------------------

  /**
   * @param {AlbumSort} sort
   * @param {number} size
   * @param {number} [offset]
   * @returns {Promise<Album[]>}
   */
  getAlbums: async function(sort, size, offset) {
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
  },

  // -------------------------------------------------------------------------
  // Random tracks
  // -------------------------------------------------------------------------

  /**
   * @param {Object} [options]
   * @param {number} [options.size]
   * @param {string} [options.genre]
   * @param {number} [options.fromYear]
   * @param {number} [options.toYear]
   * @returns {Promise<Track[]>}
   */
  getRandomTracks: async function(options) {
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
  },

  // -------------------------------------------------------------------------
  // Favourites and history
  // -------------------------------------------------------------------------

  /**
   * @returns {Promise<{albums: Album[], artists: Artist[], tracks: Track[]}>}
   */
  getFavourites: async function() {
    var response = await this.fetch('rest/getStarred2')
    var starred = response.starred2

    return {
      albums: ((starred && starred.album) || []).map(this.normalizeAlbum, this),
      artists: ((starred && starred.artist) || []).map(this.normalizeArtist, this),
      tracks: ((starred && starred.song) || []).map(this.normalizeTrack, this)
    }
  },

  /**
   * @param {number} [size]
   * @returns {Promise<Track[]>}
   */
  getRecentlyPlayedTracks: async function(size) {
    if (size === undefined) {
      size = 200
    }

    var albums = await this.getAlbums('recently-played', size)

    return albums.flatMap(function(album) {
      return album.tracks || []
    })
  },

  /**
   * @param {string} id
   * @param {string} type
   * @returns {Promise<void>}
   */
  addFavourite: async function(id, type) {
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
  },

  /**
   * @param {string} id
   * @param {string} type
   * @returns {Promise<void>}
   */
  removeFavourite: async function(id, type) {
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
  },

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /**
   * @param {string} query
   * @param {string|null} type
   * @param {number} size
   * @param {number} [offset]
   * @returns {Promise<SearchResult>}
   */
  search: async function(query, type, size, offset) {
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
  },

  // -------------------------------------------------------------------------
  // Library scan and scrobbling
  // -------------------------------------------------------------------------

  /**
   * @returns {Promise<void>}
   */
  scan: async function() {
    return this.fetch('rest/startScan')
  },

  /**
   * @returns {Promise<boolean>}
   */
  getScanStatus: async function() {
    var response = await this.fetch('rest/getScanStatus')

    return response.scanStatus.scanning
  },

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  scrobble: async function(id) {
    try {
      await this.fetch('rest/scrobble', { id: id, submission: true })
    } catch (err) {
      if (err instanceof OfflineError) {
        return
      }

      throw err
    }
  }
}
