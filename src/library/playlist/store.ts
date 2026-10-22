import { defineStore } from 'pinia'
import { Playlist } from '@/shared/api'
import { orderBy, uniq } from 'lodash-es'

export const usePlaylistStore = defineStore('playlist', {
  state: () => ({
    playlists: null as null | Playlist[],
  }),
  actions: {
    getPlaylist(id: string) {
      return this.playlists?.find(p => p.id === id) || null
    },
    load() {
      return this.api.getPlaylists().then(result => {
        this.playlists = orderBy(result, 'createdAt')
      })
    },
    create(name: string, tracks?: string[]) {
      return this.api.createPlaylist(name, tracks).then(result => {
        this.playlists = orderBy(result, 'createdAt')
      })
    },
    async update({ id, name, comment, isPublic }: Playlist) {
      const playlist = this.playlists?.find(x => x.id === id)
      if (playlist) {
        playlist.name = name
        playlist.comment = comment
        playlist.isPublic = isPublic
        await this.api.editPlaylist(id, name, comment, isPublic)
      }
    },
    async addTracks(playlistId: string, trackIds: string[]) {
      const playlist = this.playlists?.find(x => x.id === playlistId)
      if (playlist) {
        await this.api.addToPlaylist(playlistId, trackIds)
        playlist.updatedAt = new Date().toISOString()
        playlist.trackCount = (playlist?.trackCount || 0) + trackIds.length
      }
    },
    findByName(name: string) {
      const cleanName = name.trim().toLowerCase()
      return this.playlists?.find(p => p.name.trim().toLowerCase() === cleanName) || null
    },
    /**
     * Adds tracks to the playlist with this name (case-insensitive).
     * If it doesn't exist, it is created with those tracks.
     * Tracks already in the playlist are not added twice.
     */
    async addToPlaylistByName(name: string, trackIds: string[]) {
      const cleanName = name.trim()
      const ids = uniq(trackIds)
      if (!cleanName || !ids.length) return { created: false, added: 0 }

      if (this.playlists === null) {
        await this.load()
      }

      const existing = this.findByName(cleanName)

      if (!existing) {
        await this.create(cleanName, ids)
        return { created: true, added: ids.length }
      }

      return this.addUniqueTracks(existing.id, ids)
    },
    /**
     * Adds tracks to an existing playlist, skipping the ones already in it.
     */
    async addUniqueTracks(playlistId: string, trackIds: string[]) {
      const ids = uniq(trackIds)
      if (!ids.length) return { created: false, added: 0 }
      const current = await this.api.getPlaylist(playlistId)
      const present = new Set((current.tracks || []).map(t => t.id))
      const toAdd = ids.filter(id => !present.has(id))
      if (toAdd.length) {
        await this.addTracks(playlistId, toAdd)
      }
      return { created: false, added: toAdd.length }
    },
    async removeTrack(playlistId: string, index: number) {
      const playlist = this.playlists?.find(x => x.id === playlistId)
      if (playlist) {
        await this.api.removeFromPlaylist(playlistId, index)
        playlist.updatedAt = new Date().toISOString()
        playlist.trackCount = (playlist?.trackCount || 0) - 1
      }
    },
    /**
     * Removes several tracks by index. Indexes are removed from highest to lowest
     * so that each removal leaves the remaining indexes valid.
     */
    async removeTracks(playlistId: string, indexes: number[]) {
      const sorted = uniq(indexes).sort((a, b) => b - a)
      for (const index of sorted) {
        await this.removeTrack(playlistId, index)
      }
    },
    async delete(id: string) {
      await this.api.deletePlaylist(id)
      this.playlists = this.playlists!.filter(p => p.id !== id)
    },
  },
})
