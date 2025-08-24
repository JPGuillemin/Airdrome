import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
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
