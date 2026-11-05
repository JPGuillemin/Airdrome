// shared/api/playlists.js
//
// Playlist CRUD. Written in an explicit, ES5-friendly style: var, function
// expressions and async/await instead of promise chains.

import { sumBy } from 'lodash-es'

export var playlistMethods = {
  /**
   * @returns {Promise<Playlist[]>}
   */
  getPlaylists: async function() {
    var response = await this.fetch('rest/getPlaylists')
    var playlists = (response.playlists && response.playlists.playlist) || []

    return playlists.map(this.normalizePlaylist, this)
  },

  /**
   * @param {string} id
   * @returns {Promise<Playlist>}
   */
  getPlaylist: async function(id) {
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
  },

  /**
   * @param {string} name
   * @param {string[]} [tracks]
   * @returns {Promise<Playlist[]>}
   */
  createPlaylist: async function(name, tracks) {
    await this.fetch('rest/createPlaylist', { name: name, songId: tracks })

    return this.getPlaylists()
  },

  /**
   * @param {string} playlistId
   * @param {string} name
   * @param {string} comment
   * @param {boolean} isPublic
   * @returns {Promise<void>}
   */
  editPlaylist: async function(playlistId, name, comment, isPublic) {
    var params = {
      playlistId: playlistId,
      name: name,
      comment: comment,
      public: isPublic
    }

    await this.fetch('rest/updatePlaylist', params)
  },

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  deletePlaylist: async function(id) {
    await this.fetch('rest/deletePlaylist', { id: id })
  },

  /**
   * @param {string} playlistId
   * @param {string[]} tracks
   * @returns {Promise<void>}
   */
  addToPlaylist: async function(playlistId, tracks) {
    var params = {
      playlistId: playlistId,
      songIdToAdd: tracks
    }

    await this.fetch('rest/updatePlaylist', params)
  },

  /**
   * @param {string} playlistId
   * @param {number} index
   * @returns {Promise<void>}
   */
  removeFromPlaylist: async function(playlistId, index) {
    var params = {
      playlistId: playlistId,
      songIndexToRemove: index
    }

    await this.fetch('rest/updatePlaylist', params)
  }
}
