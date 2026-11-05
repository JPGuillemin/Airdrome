// shared/api/index.js
//
// Public entry point for the Subsonic API client. Holds the public type
// definitions, assembles the prototype from the method groups and re-exports
// the client entry points.

import {
  API,
  useApi,
  createApi,
  OfflineError,
  UnsupportedOperationError,
  SubsonicError
} from './client'
import { normalizeMethods } from './normalize'
import { libraryMethods } from './library'
import { playlistMethods } from './playlists'
import { queueMethods } from './queue'
import { urlMethods } from './urls'

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

Object.assign(
  API.prototype,
  normalizeMethods,
  libraryMethods,
  playlistMethods,
  queueMethods,
  urlMethods
)

export {
  API,
  useApi,
  createApi,
  OfflineError,
  UnsupportedOperationError,
  SubsonicError
}
