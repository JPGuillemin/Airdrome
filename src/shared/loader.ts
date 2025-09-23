import { defineStore } from 'pinia'

export const useLoader = defineStore('loader', {
  state: () => ({
    loading: false,
  }),
  actions: {
    showLoading() {
      this.loading = true
    },
    hideLoading() {
      this.loading = false
    },
  },
})
