// store.js
import { defineStore } from 'pinia'

export var useFavouriteStore = defineStore('favourite', {
  state: function() {
    return {
      /** Map of favourite album IDs. */
      albums: {},

      /** Map of favourite artist IDs. */
      artists: {},

      /** Map of favourite track IDs. */
      tracks: {}
    }
  },

  actions: {
    /** Load favourites from the server. */
    load: async function() {
      var result = await this.api.getFavourites()
      this.albums = createIdMap(result.albums)
      this.artists = createIdMap(result.artists)
      this.tracks = createIdMap(result.tracks)
    },

    /**
     * Return true when the given media item is a favourite.
     *
     * @param {string} type - 'track', 'album' or 'artist'.
     * @param {string} id
     * @returns {boolean}
     */
    get: function(type, id) {
      var field = getTypeKey(type)
      return !!this[field][id]
    },

    /**
     * Toggle a favourite optimistically, rolling back if the server call
     * fails.
     *
     * @param {string} type - 'track', 'album' or 'artist'.
     * @param {string} id
     * @returns {Promise<void>}
     */
    toggle: async function(type, id) {
      var field = getTypeKey(type)
      var previous = this[field]
      var wasFavourite = !!previous[id]

      // Optimistic update, rolled back if the server call fails.
      if (wasFavourite) {
        var updated = {}

        var keys = Object.keys(previous)
        for (var i = 0; i < keys.length; i++) {
          updated[keys[i]] = previous[keys[i]]
        }

        delete updated[id]
        this[field] = updated
      } else {
        var next = {}

        var previousKeys = Object.keys(previous)
        for (var j = 0; j < previousKeys.length; j++) {
          next[previousKeys[j]] = previous[previousKeys[j]]
        }

        next[id] = true
        this[field] = next
      }

      try {
        if (wasFavourite) {
          await this.api.removeFavourite(id, type)
        } else {
          await this.api.addFavourite(id, type)
        }
      } catch (err) {
        this[field] = previous
        console.warn('[favourite] failed to update ' + type + ' ' + id, err)
      }
    }
  }
})

/**
 * Turn a list of items into an ID-keyed lookup map.
 *
 * @param {Array} items
 * @returns {Object}
 */
function createIdMap(items) {
  var map = {}

  for (var i = 0; i < items.length; i++) {
    map[items[i].id] = true
  }

  return map
}

/**
 * Map a media type to its state field.
 *
 * @param {string} type
 * @returns {string}
 */
function getTypeKey(type) {
  switch (type) {
    case 'album':
      return 'albums'
    case 'artist':
      return 'artists'
    case 'track':
      return 'tracks'
    default:
      throw new Error("unknown favourite type '" + type + "'")
  }
}
