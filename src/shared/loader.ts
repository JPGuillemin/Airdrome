// loader.ts
import { defineStore } from 'pinia'

export const useLoader = defineStore('loader', {
  state: () => ({
    // Reference count: nested show/hide calls no longer cancel each other.
    count: 0,
  }),
  getters: {
    loading: (state) => state.count > 0,
  },
  actions: {
    showLoading() {
      this.count++
    },
    hideLoading() {
      this.count = Math.max(0, this.count - 1)
    },
  },
})
