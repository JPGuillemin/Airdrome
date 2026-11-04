import { defineStore } from 'pinia'
import { orderBy, uniq } from 'lodash-es'

export var usePlaylistStore = defineStore('playlist', {
  state: function() {
    return {
      /** All playlists, ordered by creation date, or null before loading. */
      playlists: null
    }
  },

  actions: {
    /**
     * Find a loaded playlist by ID.
     *
     * @param {string} id
     * @returns {Object|null}
     */
    getPlaylist: function(id) {
      if (!this.playlists) {
        return null
      }

      for (var i = 0; i < this.playlists.length; i++) {
        if (this.playlists[i].id === id) {
          return this.playlists[i]
        }
      }

      return null
    },

    /** Load playlists from the server. */
    load: async function() {
      var result = await this.api.getPlaylists()
      this.playlists = orderBy(result, 'createdAt')
    },

    /**
     * Create a playlist and refresh the local list.
     *
     * @param {string} name
     * @param {string[]} [tracks]
     * @returns {Promise<void>}
     */
    create: async function(name, tracks) {
      var result = await this.api.createPlaylist(name, tracks)
      this.playlists = orderBy(result, 'createdAt')
    },

    /**
     * Update a loaded playlist, then persist the change.
     *
     * @param {Object} playlist
     * @returns {Promise<void>}
     */
    update: async function(playlist) {
      var found = null

      if (this.playlists) {
        for (var i = 0; i < this.playlists.length; i++) {
          if (this.playlists[i].id === playlist.id) {
            found = this.playlists[i]
            break
          }
        }
      }

      if (found) {
        found.name = playlist.name
        found.comment = playlist.comment
        found.isPublic = playlist.isPublic
        await this.api.editPlaylist(
          playlist.id,
          playlist.name,
          playlist.comment,
          playlist.isPublic
        )
      }
    },

    /**
     * Add tracks to a playlist and update its local counters.
     *
     * @param {string} playlistId
     * @param {string[]} trackIds
     * @returns {Promise<void>}
     */
    addTracks: async function(playlistId, trackIds) {
      var playlist = null

      if (this.playlists) {
        for (var i = 0; i < this.playlists.length; i++) {
          if (this.playlists[i].id === playlistId) {
            playlist = this.playlists[i]
            break
          }
        }
      }

      if (playlist) {
        await this.api.addToPlaylist(playlistId, trackIds)
        playlist.updatedAt = new Date().toISOString()
        playlist.trackCount = (playlist.trackCount || 0) + trackIds.length
      }
    },

    /**
     * Find a loaded playlist by name, case-insensitively.
     *
     * @param {string} name
     * @returns {Object|null}
     */
    findByName: function(name) {
      var cleanName = name.trim().toLowerCase()

      if (!this.playlists) {
        return null
      }

      for (var i = 0; i < this.playlists.length; i++) {
        var playlist = this.playlists[i]

        if (playlist.name.trim().toLowerCase() === cleanName) {
          return playlist
        }
      }

      return null
    },

    /**
     * Adds tracks to the playlist with this name (case-insensitive).
     * If it doesn't exist, it is created with those tracks.
     * Tracks already in the playlist are not added twice.
     *
     * @param {string} name
     * @param {string[]} trackIds
     * @returns {Promise<Object>}
     */
    addToPlaylistByName: async function(name, trackIds) {
      var cleanName = name.trim()
      var ids = uniq(trackIds)

      if (!cleanName || !ids.length) {
        return { created: false, added: 0 }
      }

      if (this.playlists === null) {
        await this.load()
      }

      var existing = this.findByName(cleanName)

      if (!existing) {
        await this.create(cleanName, ids)
        return { created: true, added: ids.length }
      }

      return this.addUniqueTracks(existing.id, ids)
    },

    /**
     * Adds tracks to an existing playlist, skipping the ones already in it.
     *
     * @param {string} playlistId
     * @param {string[]} trackIds
     * @returns {Promise<Object>}
     */
    addUniqueTracks: async function(playlistId, trackIds) {
      var ids = uniq(trackIds)

      if (!ids.length) {
        return { created: false, added: 0 }
      }

      var current = await this.api.getPlaylist(playlistId)
      var tracks = current.tracks || []
      var present = new Set()

      for (var i = 0; i < tracks.length; i++) {
        present.add(tracks[i].id)
      }

      var toAdd = []

      for (var j = 0; j < ids.length; j++) {
        if (!present.has(ids[j])) {
          toAdd.push(ids[j])
        }
      }

      if (toAdd.length) {
        await this.addTracks(playlistId, toAdd)
      }

      return { created: false, added: toAdd.length }
    },

    /**
     * Remove one track by index and update the local counters.
     *
     * @param {string} playlistId
     * @param {number} index
     * @returns {Promise<void>}
     */
    removeTrack: async function(playlistId, index) {
      var playlist = null

      if (this.playlists) {
        for (var i = 0; i < this.playlists.length; i++) {
          if (this.playlists[i].id === playlistId) {
            playlist = this.playlists[i]
            break
          }
        }
      }

      if (playlist) {
        await this.api.removeFromPlaylist(playlistId, index)
        playlist.updatedAt = new Date().toISOString()
        playlist.trackCount = (playlist.trackCount || 0) - 1
      }
    },

    /**
     * Removes several tracks by index. Indexes are removed from highest to
     * lowest so that each removal leaves the remaining indexes valid.
     *
     * @param {string} playlistId
     * @param {number[]} indexes
     * @returns {Promise<void>}
     */
    removeTracks: async function(playlistId, indexes) {
      var sorted = uniq(indexes).sort(function(a, b) {
        return b - a
      })

      for (var i = 0; i < sorted.length; i++) {
        await this.removeTrack(playlistId, sorted[i])
      }
    },

    /**
     * Delete a playlist and drop it from the local list.
     *
     * @param {string} id
     * @returns {Promise<void>}
     */
    delete: async function(id) {
      await this.api.deletePlaylist(id)

      if (this.playlists) {
        this.playlists = this.playlists.filter(function(p) {
          return p.id !== id
        })
      } else {
        this.playlists = null
      }
    }
  }
})
