// loader.js
import { defineStore } from 'pinia'

export var useLoader = defineStore('loader', {
  state: function() {
    return {
      // Reference count: nested show/hide calls no longer cancel each other.
      count: 0
    }
  },

  getters: {
    /** True while at least one loading operation is active. */
    loading: function(state) {
      return state.count > 0
    }
  },

  actions: {
    /** Start one loading operation. */
    showLoading: function() {
      this.count++
    },

    /** Finish one loading operation. */
    hideLoading: function() {
      this.count = Math.max(0, this.count - 1)
    }
  }
})
