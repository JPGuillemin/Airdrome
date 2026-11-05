// shared/api/normalize.js
//
// Response normalisation helpers. Written in an explicit, ES5-friendly style:
// var, function expressions and explicit property access.

import { startCase, uniqBy } from 'lodash-es'

export var normalizeMethods = {
  /**
   * @param {Object} item
   * @returns {Track}
   */
  normalizeTrack: function(item) {
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
  },

  /**
   * @param {Object} item
   * @returns {AlbumGenre[]}
   */
  normalizeGenres: function(item) {
    if (item.genres && item.genres.length) {
      return item.genres
    }

    if (item.genre) {
      return [{ name: item.genre }]
    }

    return []
  },

  /**
   * @param {Object} item
   * @returns {Album}
   */
  normalizeAlbum: function(item) {
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
  },

  /**
   * @param {Object} item
   * @returns {string}
   */
  normalizeReleaseType: function(item) {
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
  },

  /**
   * @param {Object} item
   * @returns {Artist}
   */
  normalizeArtist: function(item) {
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
  },

  /**
   * @param {Object} response
   * @returns {Playlist}
   */
  normalizePlaylist: function(response) {
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
}
