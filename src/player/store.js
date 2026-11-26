// store.js
//
// Player state and the audio wiring. Written in an explicit, ES5-friendly
// style: var, function expressions, explicit property access and async/await
// instead of promise chains.

import { defineStore } from 'pinia'
import {
  shuffle,
  shuffled,
  trackListEquals,
  formatArtists,
  sleep
} from '@/shared/utils'
import {
  audio,
  platform,
  storedReplayGainMode,
  ReplayGainMode,
  setMediaSessionMetadata,
  setMediaSessionPosition,
  setMediaSessionState
} from '@/player/engine'
import { saveSession, releaseSession } from './lifecycle'

// ---------------------------------------------------------------------------
// Clean up keys that are no longer used
// ---------------------------------------------------------------------------

localStorage.removeItem('player.mute')
localStorage.removeItem('queue')
localStorage.removeItem('queueIndex')

// ---------------------------------------------------------------------------
// Module-level singletons
// ---------------------------------------------------------------------------

/**
 * How many upcoming tracks are described to the native player. A larger
 * window lets background playback continue when the WebView is suspended.
 */
var NATIVE_WINDOW_AHEAD = 10

/**
 * In-flight radio extension (if any). Shared so that two near-simultaneous
 * triggers never start two fetches.
 */
var extending = null

/**
 * Queue offsets described to the native player: the previous track and the
 * next NATIVE_WINDOW_AHEAD tracks.
 *
 * @returns {number[]}
 */
function windowOffsets() {
  var offsets = [-1]

  for (var i = 0; i <= NATIVE_WINDOW_AHEAD; i++) {
    offsets.push(i)
  }

  return offsets
}

/**
 * @typedef {import('@/shared/api').Track} Track
 * @typedef {import('@/shared/api').MediaImage} MediaImage
 */

/**
 * Import the radio store and extend the queue. The in-flight promise is
 * shared through `extending` so near-simultaneous triggers reuse it.
 *
 * @param {Track} track
 * @returns {Promise<boolean>}
 */
async function extendRadioQueue(track) {
  var result

  try {
    // Dynamic import keeps the player store free of a static dependency
    // on the radio store (they are mutually dependent).
    var module = await import('./radio')
    result = await module.useRadioStore().extendQueue(track)
  } catch (error) {
    console.warn('[Radio] queue extension failed', error)
    result = false
  }

  extending = null
  return result
}

/**
 * Move to another queue index and load it, with the transition guard and the
 * post-load MediaSession refresh shared by next() and back().
 *
 * @param {Object} store
 * @param {number} index
 * @param {boolean} fade
 * @returns {Promise<void>}
 */
async function changeTrack(store, index, fade) {
  store.inTransition = true
  store.setQueueIndex(index)

  try {
    await store.loadTrack({ fade: fade })
    store.inTransition = false
    await sleep(200)
    store.setMediaSessionPosition()
    store.setMediaSessionState()
  } catch (error) {
    store.inTransition = false
    throw error
  }
}

// ---------------------------------------------------------------------------
// Pinia store
// ---------------------------------------------------------------------------

export var usePlayerStore = defineStore('player', {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  state: function() {
    return {
      /** Ordered list of tracks in the current playback queue. */
      queue: [],

      /** Index of the currently playing track within queue (-1 = nothing). */
      queueIndex: -1,

      /** Duration of the current track in seconds. */
      duration: 0.0,

      /** Current playback position in seconds. */
      currentTime: 0.0,

      /** Active ReplayGain normalisation mode. */
      replayGainMode: storedReplayGainMode,

      /** Whether the queue loops back to the beginning. */
      repeat: localStorage.getItem('player.repeat') === 'true',

      /** Whether the queue was shuffled when loaded. */
      shuffle: localStorage.getItem('player.shuffle') === 'true',

      /**
       * When enabled, this device pauses if another device writes the server
       * play queue. Disable it to allow multiple devices to play concurrently.
       */
      singleSession: localStorage.getItem('player.singleSession') !== 'false',

      /** Master volume (0-1). */
      volume: 1.0,

      /** True while the audio element is actively playing. */
      isPlaying: false,

      /** True once the current track has been scrobbled. */
      scrobbled: false,

      /**
       * Incremented every time a play has been reported to the server.
       * Views that show server-side stats (Discover) watch it, because the
       * play is now counted when the track ends, not mid-track.
       */
      scrobbleCount: 0,

      /** True while skipping next/back. */
      inTransition: false,

      /**
       * True when the user explicitly paused.
       * Used by the mobile auto-resume logic to avoid resuming after an
       * OS-level interruption if the user had intentionally paused.
       */
      userPaused: true,

      /** Timestamp (ms) of the last takeover by another device. */
      takeoverAt: 0
    }
  },

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------
  getters: {
    /** Currently active track, or null when the queue is empty. */
    track: function() {
      if (this.queue && this.queueIndex !== -1) {
        return this.queue[this.queueIndex]
      }

      return null
    },

    /** The track that will play after the current one. */
    nextTrack: function() {
      if (!this.queue || !this.queue.length) {
        return null
      }

      // On the last track with repeat off there is no next track.
      if (!this.hasNext && !this.repeat) {
        return null
      }

      return this.queue[(this.queueIndex + 1) % this.queue.length]
    },

    /**
     * Changes when the previous / current / next tracks (what the native
     * player needs, see syncWindow) or the ReplayGain mode change.
     */
    windowKey: function() {
      var queue = this.queue || []
      var values = [this.queueIndex, this.repeat, this.replayGainMode]
      var offsets = windowOffsets()

      for (var i = 0; i < offsets.length; i++) {
        var track = queue[this.queueIndex + offsets[i]]
        values.push(track ? track.id : '')
      }

      return values.join('|')
    },

    /** Shorthand for the current track ID. */
    trackId: function() {
      if (this.track) {
        return this.track.id
      }

      return null
    },

    /** True when there is at least one more track after the current one. */
    hasNext: function() {
      return !!this.queue && this.queueIndex < this.queue.length - 1
    },

    /** True when the current track is not the first in the queue. */
    hasPrevious: function() {
      return this.queueIndex > 0
    }
  },

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  actions: {
    /** Append tracks to the end of the queue as-is. */
    appendTracks: function(tracks) {
      if (!tracks.length) {
        return
      }

      this.queue.push.apply(this.queue, tracks)
      this.saveQueue()
    },

    /**
     * Ask the radio store to enqueue more tracks when the current track is
     * the last one and repeat is off.
     *
     * @returns {Promise<void>}
     */
    ensureNextTrack: async function() {
      if (this.hasNext || this.repeat) {
        return
      }

      var track = this.track

      if (!track) {
        return
      }

      if (!extending) {
        extending = extendRadioQueue(track)
      }

      // The caller only needs to know the attempt finished.
      await extending
    },

    /**
     * Load the current queue track into the audio controller.
     *
     * @param {Object} [options]
     * @param {boolean} [options.fade]
     * @param {boolean} [options.paused]
     * @returns {Promise<void>}
     */
    loadTrack: async function(options) {
      var settings = options || {}
      var track = this.track

      if (!track) {
        return
      }

      var nextTrack = this.nextTrack
      var nextUrl = undefined

      if (nextTrack) {
        nextUrl = nextTrack.url
      }

      var loadOptions = {
        url: track.url,
        replayGain: track.replayGain,
        nextUrl: nextUrl
      }

      if (settings.fade !== undefined) {
        loadOptions.fade = settings.fade
      }

      if (settings.paused !== undefined) {
        loadOptions.paused = settings.paused
      }

      await audio.loadTrack(loadOptions)

      // Native needs its queue window re-pushed after a load; the engine
      // decides whether that is required.
      platform.afterLoad(this)
    },

    /**
     * Replace the queue with tracks and start from the first track.
     *
     * @param {Track[]} tracks
     * @returns {Promise<void>}
     */
    playNow: async function(tracks) {
      this.setShuffle(false)
      await this.playTrackList(tracks, 0)
    },

    /**
     * Replace the queue with a shuffled version and start playing.
     *
     * @param {Track[]} tracks
     * @returns {Promise<void>}
     */
    shuffleNow: async function(tracks) {
      this.setShuffle(true)
      await this.playTrackList(tracks)
    },

    /**
     * Jump to a queue position without replacing the queue.
     *
     * @param {number} index
     * @returns {Promise<void>}
     */
    playTrackListIndex: async function(index) {
      this.inTransition = true
      this.setQueueIndex(index)

      try {
        await this.loadTrack({ fade: true })
        this.inTransition = false
      } catch (error) {
        this.inTransition = false
        throw error
      }
    },

    /**
     * Replace the queue (unless unchanged) and start playback.
     *
     * @param {Track[]} tracks
     * @param {number} [index]
     * @returns {Promise<void>}
     */
    playTrackList: async function(tracks, index) {
      var list = tracks
      this.inTransition = true

      if (index == null) {
        index = this.shuffle ? Math.floor(Math.random() * list.length) : 0
      }

      if (this.shuffle) {
        list = list.slice()
        shuffle(list, index)
        index = 0
      }

      if (!trackListEquals(this.queue || [], list)) {
        this.setQueue(list)
      }

      this.setQueueIndex(index)

      try {
        await this.loadTrack({ fade: true })
        this.inTransition = false
      } catch (error) {
        this.inTransition = false
        throw error
      }
    },

    /**
     * Native already switched to another track by itself: follow it without
     * reloading anything.
     *
     * @param {number} index
     * @returns {void}
     */
    followNative: function(index) {
      this.setQueueIndex(index)
      // Persist the new position promptly: the WebView may be frozen again
      // before the next 10-second autosave tick.
      this.saveQueue()
    },

    /**
     * Describe the queue around the current track to the native player so it
     * can start the next track while the WebView is suspended. JS remains the
     * owner of the queue; at the edge of the window native emits 'ended' and
     * JS decides what happens next (radio extension, repeat, end of queue).
     *
     * @returns {Promise<void>}
     */
    syncWindow: async function() {
      if (!this.queue || !this.queue.length || this.queueIndex < 0) {
        return
      }

      var queue = this.queue
      var count = queue.length
      var offsets = windowOffsets()
      var indexes = []
      var seen = new Set()

      for (var i = 0; i < offsets.length; i++) {
        var index = this.queueIndex + offsets[i]

        if (this.repeat) {
          index = (index + count) % count
        }

        if (index >= 0 && index < count && !seen.has(index)) {
          seen.add(index)
          indexes.push(index)
        }
      }

      var tracks = []

      for (var j = 0; j < indexes.length; j++) {
        var position = indexes[j]
        var track = queue[position]

        tracks.push({
          index: position,
          url: track.url,
          title: track.title || '',
          artist: formatArtists(track.artists || []),
          album: track.album || '',
          artworkUrl: track.image || null,
          duration: track.duration || 0,
          replayGain: track.replayGain
        })
      }

      try {
        await audio.setWindow(tracks, this.queueIndex)
      } catch (error) {
        console.warn('[Player] setWindow failed', error)
      }
    },

    /** Resume playback. */
    play: async function() {
      await audio.resume()
      await audio.play()
    },

    /** Pause playback. */
    pause: async function() {
      this.userPaused = true
      await audio.pause()
    },

    /**
     * Pause because the OS or an output device interrupted playback.
     * Unlike pause(), this does not mark the pause as user-initiated, so
     * playback can resume when the device comes back.
     */
    interrupt: async function() {
      await audio.pause()
    },

    /** Stop playback and clear the pipeline. */
    stop: async function() {
      this.userPaused = true

      await audio.stop()
      this.setMediaSessionPosition(this.duration, 0)
      this.setMediaSessionState('none')
    },

    /** Toggle between play and pause. */
    playPause: async function() {
      if (this.isPlaying) {
        await this.pause()
        return
      }

      await this.play()
    },

    /**
     * Advance to the next track.
     *
     * @param {boolean} [fade]
     * @returns {Promise<void>}
     */
    next: async function(fade) {
      if (this.hasNext || this.repeat) {
        await changeTrack(this, this.queueIndex + 1, fade !== false)
        return
      }

      return this.processQueueEnd()
    },

    /**
     * Go back to the previous track, or restart the current one after 3s.
     *
     * @returns {Promise<void>}
     */
    back: async function() {
      if (this.currentTime > 3) {
        return this.seek(0)
      }

      await changeTrack(this, this.queueIndex - 1, true)
    },

    /**
     * Seek to an absolute position in seconds.
     *
     * @param {number} position
     * @returns {Promise<void>}
     */
    seek: async function(position) {
      await audio.seek(position)
      await sleep(200)
      this.setMediaSessionPosition()
      this.setMediaSessionState()
    },

    /**
     * Restore the play queue from the server.
     *
     * @returns {Promise<void>}
     */
    loadQueue: async function() {
      var queue = await this.api.getPlayQueue()

      if (!queue.tracks) {
        return
      }

      this.setQueue(queue.tracks)
      this.setQueueIndex(queue.currentTrack)

      if (!this.track) {
        return
      }

      await this.loadTrack({ fade: true, paused: true })
      await this.seek(queue.currentTrackPosition)
    },

    /**
     * Persist the queue; the session decides whether this device may write.
     *
     * @param {Object} [options]
     * @returns {Promise<void>}
     */
    saveQueue: async function(options) {
      await saveSession(options)
    },

    /**
     * Restart the queue from index 0 without changing the track list.
     *
     * @returns {Promise<void>}
     */
    resetQueue: async function() {
      if (!this.queue.length || !this.track || !this.track.url) {
        this.setQueueIndex(-1)
        return
      }

      this.setQueueIndex(0)

      if (!this.track) {
        return
      }

      await this.loadTrack({ fade: true, paused: true })
    },

    /**
     * Remove all tracks except the currently playing one.
     *
     * @returns {Promise<void>}
     */
    clearQueue: async function() {
      if (!this.queue.length) {
        return
      }

      if (this.queue.length > 1) {
        this.setQueue([this.queue[this.queueIndex]])
        this.setQueueIndex(0)
        this.saveQueue()
        return
      }

      this.setQueue([])
      this.setQueueIndex(-1)

      await this.stop()
      this.saveQueue()
    },

    /**
     * Update the MediaSession scrubber position.
     *
     * @param {number} [duration]
     * @param {number} [position]
     * @returns {void}
     */
    setMediaSessionPosition: function(duration, position) {
      var total = duration != null ? duration : this.duration
      var current = position != null ? position : this.currentTime

      setMediaSessionPosition(total, current, this.isPlaying)
    },

    /**
     * Update the MediaSession playback state.
     *
     * @param {string} [state]
     * @returns {void}
     */
    setMediaSessionState: function(state) {
      var value = state || (this.isPlaying ? 'playing' : 'paused')

      setMediaSessionState(value, this.currentTime)
    },

    /**
     * Append tracks to the end of the queue.
     *
     * @param {Track[]} tracks
     * @returns {void}
     */
    addToQueue: function(tracks) {
      var lastTrack = null

      if (this.queue && this.queue.length > 0) {
        lastTrack = this.queue[this.queue.length - 1]
      }

      if (tracks.length === 1 && lastTrack && tracks[0].id === lastTrack.id) {
        return
      }

      this.appendTracks(this.shuffle ? shuffled(tracks) : tracks)
    },

    /**
     * Insert tracks immediately after the current position.
     *
     * @param {Track[]} tracks
     * @returns {void}
     */
    setNextInQueue: function(tracks) {
      var nextTrack = this.nextTrack

      if (tracks.length === 1 && nextTrack && tracks[0].id === nextTrack.id) {
        return
      }

      var list = tracks

      if (this.shuffle) {
        list = shuffled(tracks)
      }

      if (this.queue) {
        this.queue.splice.apply(this.queue, [this.queueIndex + 1, 0].concat(list))
      }

      this.saveQueue()
    },

    /**
     * Remove a track at the given queue index.
     *
     * @param {number} index
     * @returns {Promise<void>}
     */
    removeFromQueue: async function(index) {
      var wasCurrent = index === this.queueIndex

      this.queue = this.queue.filter(function(track, position) {
        return position !== index
      })

      if (index < this.queueIndex) {
        this.queueIndex -= 1
      }

      if (!wasCurrent) {
        this.saveQueue()
        return
      }

      if (this.queue.length === 0) {
        this.queueIndex = -1
        await this.stop()
        this.saveQueue()
        return
      }

      this.inTransition = true
      this.setQueueIndex(Math.min(this.queueIndex, this.queue.length - 1))

      var load = Promise.resolve()

      if (this.track && this.isPlaying) {
        load = this.loadTrack({ fade: true })
      }

      try {
        await load
        this.inTransition = false
        this.saveQueue()
      } catch (error) {
        this.inTransition = false
        throw error
      }
    },

    /** Re-shuffle the queue, keeping the current track at index 0. */
    shuffleQueue: function() {
      if (this.queue && this.queue.length > 0) {
        this.queue = shuffled(this.queue, this.queueIndex)
        this.queueIndex = 0
      }
    },

    /** Cycle through ReplayGain modes and persist the choice. */
    toggleReplayGain: function() {
      var mode = (this.replayGainMode + 1) % ReplayGainMode._Length
      audio.setReplayGainMode(mode)
      this.replayGainMode = mode
      localStorage.setItem('player.replayGainMode', String(mode))
    },

    /** Toggle queue repeat and persist it. */
    toggleRepeat: function() {
      this.repeat = !this.repeat
      localStorage.setItem('player.repeat', String(this.repeat))
    },

    /** Toggle shuffle mode. */
    toggleShuffle: function() {
      this.setShuffle(!this.shuffle)
    },

    /**
     * Enable/disable single-session takeover detection.
     *
     * @param {boolean} enabled
     * @returns {void}
     */
    setSingleSession: function(enabled) {
      this.singleSession = enabled
      localStorage.setItem('player.singleSession', String(enabled))

      if (!enabled) {
        releaseSession()
      }
    },

    /**
     * Set master volume.
     *
     * @param {number} volume
     * @returns {void}
     */
    setVolume: function(volume) {
      audio.setVolume(volume)
      this.volume = volume
    },

    /**
     * Set the shuffle flag and persist it.
     *
     * @param {boolean} toggle
     * @returns {void}
     */
    setShuffle: function(toggle) {
      this.shuffle = toggle
      localStorage.setItem('player.shuffle', String(toggle))
    },

    /**
     * Replace the queue and reset the index.
     *
     * @param {Track[]} queue
     * @returns {void}
     */
    setQueue: function(queue) {
      this.queue = queue
      this.queueIndex = -1
    },

    /**
     * Retry the radio extension when the queue ends, then restart or fall back.
     *
     * @returns {Promise<void>}
     */
    processQueueEnd: async function() {
      if (!this.track || !this.track.url) {
        return
      }

      await this.ensureNextTrack()

      if (this.hasNext) {
        await this.next(false)
        return
      }

      await this.resetQueue()
    },

    /**
     * Update lock-screen / notification metadata.
     *
     * @param {string} [trackTitle]
     * @param {string} [trackArtist]
     * @param {string} [trackAlbum]
     * @returns {void}
     */
    updateMediaSession: function(trackTitle, trackArtist, trackAlbum) {
      var track = this.track

      if (!track) {
        return
      }

      var title = 'Loading ...'

      if (trackTitle != null) {
        title = trackTitle
      } else if (track.title != null) {
        title = track.title
      }

      var artist = formatArtists(track.artists || [])

      if (trackArtist != null) {
        artist = trackArtist
      }

      var album = ''

      if (trackAlbum != null) {
        album = trackAlbum
      } else if (track.album != null) {
        album = track.album
      }

      setMediaSessionMetadata({
        title: title,
        artist: artist,
        album: album,
        artworkUrl: track.image || null,
        duration: this.duration || track.duration || 0
      })
    },

    /**
     * Update queueIndex and refresh track metadata.
     *
     * @param {number} index
     * @returns {void}
     */
    setQueueIndex: function(index) {
      if (!this.queue || this.queue.length === 0) {
        this.queueIndex = -1
        this.duration = 0
        this.setMediaSessionState('paused')
        return
      }

      var nextIndex = Math.max(0, index)

      if (nextIndex >= this.queue.length) {
        if (this.repeat) {
          nextIndex = 0
        } else {
          this.queueIndex = this.queue.length - 1
          return
        }
      }

      this.queueIndex = nextIndex

      if (!this.track) {
        return
      }

      this.scrobbled = false
      this.duration = this.track.duration
      this.currentTime = 0
      this.updateMediaSession()
    }
  }
})
