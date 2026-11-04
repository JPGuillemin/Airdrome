// store.js
//
// Global application store: login state, menu visibility, errors and user
// settings. Written in an explicit, ES5-friendly style: var, function
// expressions and if/else instead of ternaries.

import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'

/**
 * @typedef {'desc'|'asc'} ArtistAlbumSortOrder
 */

export var useMainStore = defineStore('main', {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  state: function() {
    return {
      /** True once the user has logged in. */
      isLoggedIn: false,

      /** Logged-in username, or null when logged out. */
      username: null,

      /** Server URL, or null when logged out. */
      server: null,

      /** Last error shown to the user, or null. */
      error: null,

      /** True while the side menu is open. */
      menuVisible: false,

      /** Persisted sort order for the albums of an artist. */
      artistAlbumSortOrder: useLocalStorage('settings.artistAlbumSortOrder', 'desc')
    }
  },

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  actions: {
    /**
     * Store an error for the UI to display.
     *
     * @param {Error} error
     * @returns {void}
     */
    setError: function(error) {
      this.error = error
    },

    /**
     * Clear the current error.
     *
     * @returns {void}
     */
    clearError: function() {
      this.error = null
    },

    /**
     * Record a successful login.
     *
     * @param {string} username
     * @param {string} server
     * @returns {void}
     */
    setLoginSuccess: function(username, server) {
      this.isLoggedIn = true
      this.username = username
      this.server = server
    },

    /**
     * Open the side menu.
     *
     * @returns {void}
     */
    showMenu: function() {
      this.menuVisible = true
    },

    /**
     * Close the side menu.
     *
     * @returns {void}
     */
    hideMenu: function() {
      this.menuVisible = false
    },

    /**
     * Toggle the side menu.
     *
     * @returns {void}
     */
    toggleMenu: function() {
      this.menuVisible = !this.menuVisible
    },

    /**
     * Flip the artist album sort order and persist it.
     *
     * @returns {void}
     */
    toggleArtistAlbumSortOrder: function() {
      if (this.artistAlbumSortOrder === 'asc') {
        this.artistAlbumSortOrder = 'desc'
      } else {
        this.artistAlbumSortOrder = 'asc'
      }
    }
  }
})
