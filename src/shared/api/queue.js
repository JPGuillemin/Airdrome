// shared/api/queue.js
//
// Play queue sync. Written in an explicit, ES5-friendly style: var, function
// expressions and async/await instead of promise chains.

import { OfflineError } from './client'

export var queueMethods = {
  /**
   * @returns {Promise<PlayQueue>}
   */
  getPlayQueue: async function() {
    // `_` makes every URL unique so no HTTP cache or service worker can serve a stale queue
    var response = await this.fetch('rest/getPlayQueue', { _: Date.now() })
    var playQueue = response.playQueue
    var entries = []

    if (playQueue && playQueue.entry) {
      entries = playQueue.entry
    }

    var tracks = entries.map(this.normalizeTrack, this)
    var currentTrackId = undefined

    if (playQueue && playQueue.current != null) {
      currentTrackId = playQueue.current.toString()
    }

    var index = tracks.findIndex(function(track) {
      return track.id === currentTrackId
    })
    var currentTrack = 0

    if (index >= 0) {
      currentTrack = index
    }

    var position = (playQueue && playQueue.position) || 0
    var changed = undefined
    var changedBy = undefined

    if (playQueue) {
      changed = playQueue.changed
      changedBy = playQueue.changedBy
    }

    return {
      tracks: tracks,
      currentTrack: currentTrack,
      currentTrackPosition: position / 1000,
      changed: changed,
      changedBy: changedBy
    }
  },

  /**
   * Resolves true when the queue was written, false when the error was swallowed (offline etc.).
   *
   * @param {Track[]} tracks
   * @param {Track|null} currentTrack
   * @param {number|null} currentTime
   * @returns {Promise<boolean>}
   */
  savePlayQueue: async function(tracks, currentTrack, currentTime) {
    try {
      var tracksIds = tracks
        .filter(function(track) {
          return !track.isStream
        })
        .map(function(track) {
          return track.id
        })

      var currentId = undefined

      if (currentTrack && !currentTrack.isStream) {
        currentId = currentTrack.id
      }

      var position = undefined

      if (currentTime != null) {
        position = Math.round(currentTime * 1000)
      }

      await this.fetch('rest/savePlayQueue', {
        c: this.sessionClient, // identifies this device in getPlayQueue().changedBy
        id: tracksIds,
        current: currentId,
        position: position
      })

      return true
    } catch (err) {
      if (err instanceof OfflineError) {
        return false
      }

      if (err.code === 0 || err.code === 10) {
        return false
      }

      throw err
    }
  }
}
