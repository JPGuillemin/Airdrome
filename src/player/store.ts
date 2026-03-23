import { watch } from 'vue'
import { defineStore } from 'pinia'
import { shuffle, shuffled, trackListEquals, formatArtists, sleep } from '@/shared/utils'
import { Track } from '@/shared/api'
import { AudioController, ReplayGainMode } from '@/player/audio'
import { useMainStore } from '@/shared/store'
import { throttle } from 'lodash-es'
import { useRadioStore } from './radio'

// ---------------------------------------------------------------------------
// Clean up keys that are no longer used
// ---------------------------------------------------------------------------
localStorage.removeItem('player.mute')
localStorage.removeItem('queue')
localStorage.removeItem('queueIndex')

// ---------------------------------------------------------------------------
// Module-level singletons
// ---------------------------------------------------------------------------
// These are created once and shared across the whole app lifetime.
// Placing them outside the store avoids re-creation on hot-reload.

/** Volume restored from localStorage, default 1.0. */
const storedVolume = parseFloat(localStorage.getItem('player.volume') || '1.0')

/** ReplayGain mode restored from localStorage, default None (0). */
const storedReplayGainMode = parseInt(localStorage.getItem('player.replayGainMode') ?? '0')

/** Browser MediaSession API (undefined on unsupported browsers). */
const mediaSession: MediaSession | undefined = navigator.mediaSession
if (mediaSession) mediaSession.playbackState = 'none'

/** Singleton Web Audio controller – owns the AudioContext and pipeline. */
const audio = new AudioController()

// Pseudo 0 for things that have to be null, but can't
const mediaSessionProgressRate = 1

// ---------------------------------------------------------------------------
// Pinia store
// ---------------------------------------------------------------------------

export const usePlayerStore = defineStore('player', {
  // ── State ─────────────────────────────────────────────────────────────────
  state: () => ({
    /** Ordered list of tracks in the current playback queue. */
    queue: [] as Track[],

    /** Index of the currently playing track within queue (-1 = nothing loaded). */
    queueIndex: -1,

    /** Duration of the current track in seconds (from audio metadata). */
    duration: 0.0,

    /** Current playback position in seconds, updated on every timeupdate event. */
    currentTime: 0.0,

    /** Active ReplayGain normalisation mode. */
    replayGainMode: storedReplayGainMode as ReplayGainMode,

    /** Whether the queue loops back to the beginning when it reaches the end. */
    repeat: localStorage.getItem('player.repeat') === 'true',

    /** Whether the queue was shuffled when loaded. */
    shuffle: localStorage.getItem('player.shuffle') === 'true',

    /** Master volume (0–1). */
    volume: storedVolume,

    /** True while the audio element is actively playing. */
    isPlaying: false,

    /** True once the current track has been scrobbled (sent to the API). */
    scrobbled: false,

    /**
     * True when the user explicitly paused.
     * Used by the mobile auto-resume logic to avoid resuming after an
     * OS-level interruption if the user had intentionally paused.
     */
    wasPaused: true,

    /**
     * Holds the track that was auto-skipped near its end so that the
     * watcher doesn't trigger next() a second time on the same track.
     */
    skippedTrack: null as Track | null
  }),

  // ── Getters ───────────────────────────────────────────────────────────────
  getters: {
    /** Currently active track, or null when the queue is empty / not started. */
    track(): Track | null {
      if (this.queue && this.queueIndex !== -1) {
        return this.queue[this.queueIndex]
      }
      return null
    },

    /** The track that will play after the current one (wraps around). */
    nextTrack(): Track | null {
      if (this.queue && this.queue.length > 0) {
        const next = (this.queueIndex + 1) % this.queue.length
        return this.queue[next]
      }
      return null
    },

    /** Shorthand for the current track's ID (null when nothing is loaded). */
    trackId(): string | null {
      return this.track?.id ?? null
    },

    /**
     * Current playback position clamped to [0, duration].
     * Returns 0 when duration is unknown.
     */
    progress(): number {
      if (this.duration > 0) {
        return Math.min(this.currentTime, this.duration)
      }
      return 0
    },

    /** True when there is at least one more track after the current one. */
    hasNext(): boolean {
      return !!this.queue && (this.queueIndex < this.queue.length - 1)
    },

    /** True when the current track is not the first in the queue. */
    hasPrevious(): boolean {
      return this.queueIndex > 0
    },
  },

  // ── Actions ───────────────────────────────────────────────────────────────
  actions: {
    /**
     * Replace the queue with `tracks` and start playing from the first track.
     * Shuffle is disabled so the order matches what was passed in.
     */
    async playNow(tracks: Track[]) {
      this.setShuffle(false)
      await this.playTrackList(tracks, 0)
    },

    /**
     * Replace the queue with a shuffled version of `tracks` and start playing.
     * A random starting track is chosen by playTrackList when index is omitted.
     */
    async shuffleNow(tracks: Track[]) {
      this.setShuffle(true)
      await this.playTrackList(tracks)
    },

    /**
     * Jump to a specific queue position without replacing the queue.
     * Pre-loads the next track's URL into the audio buffer.
     */
    async playTrackListIndex(index: number) {
      this.setQueueIndex(index)
      const track = this.track
      const nextTrack = this.nextTrack
      if (!track) return
      await audio.loadTrack({
        url: track.url,
        replayGain: track.replayGain,
        nextUrl: nextTrack?.url,
        fade: true
      })
    },

    /**
     * Replace the queue (unless it already contains the same tracks) and
     * start playback from the given index.
     *
     * When shuffle is enabled the track list is shuffled in-place so the
     * chosen starting track ends up at index 0.
     */
    async playTrackList(tracks: Track[], index?: number) {
      if (index == null) {
        // Pick a random start position when shuffling, otherwise start at 0
        index = this.shuffle ? Math.floor(Math.random() * tracks.length) : 0
      }
      if (this.shuffle) {
        tracks = [...tracks]
        shuffle(tracks, index) // Moves the chosen track to position 0
        index = 0
      }
      // Avoid resetting the queue if the contents haven't changed
      if (!trackListEquals(this.queue || [], tracks)) {
        this.setQueue(tracks)
      }
      this.setQueueIndex(index)
      const track = this.track
      const nextTrack = this.nextTrack
      if (!track) return
      await audio.loadTrack({
        url: track.url,
        replayGain: track.replayGain,
        nextUrl: nextTrack?.url,
        fade: true
      })
    },

    /** Resume playback and update the MediaSession position state. */
    async play() {
      this.wasPaused = false
      await audio.play()
    },

    /** Pause playback and update the MediaSession position state. */
    async pause() {
      this.wasPaused = true
      await audio.pause()
    },
    
    async stop() {
      this.wasPaused = true
      await audio.stop()
      this.setMediaSessionPosition(0, 0)
    },

    /** Toggle between play and pause. */
    async playPause() {
      if (this.isPlaying === true) {
        return this.pause()
      } else {
        return this.play()
      }
    },

    /**
     * Advance to the next track.
     *
     * @param fade - Whether to cross-fade into the next track.
     *
     * If there is no next track and repeat is off, processQueueEnd() is called
     * which may hand off to the radio store for auto-continuation.
     */
    async next(fade = true) {
      if (this.hasNext || this.repeat) {
        this.setQueueIndex(this.queueIndex + 1)
        const track = this.track
        const nextTrack = this.nextTrack
        if (!track) return
        await audio.loadTrack({
          url: track.url,
          replayGain: track.replayGain,
          nextUrl: nextTrack?.url,
          fade
        })
        await sleep(200)
        this.setMediaSessionPosition(this.duration, 0)
      } else {
        await this.processQueueEnd()
      }
    },

    /**
     * Go back to the previous track.
     *
     * If the current track has been playing for more than 3 seconds, restart
     * it instead of jumping to the previous one.
     */
    async back() {
      if (this.currentTime > 3) {
        await this.seek(0)
      } else {
        this.setQueueIndex(this.queueIndex - 1)
        const track = this.track
        const nextTrack = this.nextTrack
        if (!track) return
        await audio.loadTrack({
          url: track.url,
          replayGain: track.replayGain,
          nextUrl: nextTrack?.url,
          fade: true
        })
        await sleep(200)
        this.setMediaSessionPosition(this.duration, 0)
      }
    },

    /** Seek to an absolute position in seconds. */
    async seek(position: number) {
      await audio.seek(position)
      await sleep(200)
      this.setMediaSessionPosition()
    },

    /**
     * Restore the play queue from the server (saved on the previous session).
     * The track is loaded in a paused state and seeked to the saved position.
     */
    async loadQueue() {
      const { tracks, currentTrack, currentTrackPosition } = await this.api.getPlayQueue()
      if (!tracks) {
        return
      }
      this.setQueue(tracks)
      this.setQueueIndex(currentTrack)
      const track = this.track
      const nextTrack = this.nextTrack
      if (!track) return
      await audio.loadTrack({
        url: track.url,
        replayGain: track.replayGain,
        nextUrl: nextTrack?.url,
        fade: true,
        paused: true // Don't auto-play on restore
      })
      await this.seek(currentTrackPosition)
    },

    /**
     * Restart the queue from index 0 without changing the track list.
     * Used when radio continuation fails and there is no fallback.
     */
    async resetQueue() {
      if (!this.queue.length || !this.track?.url) {
        this.setQueueIndex(-1)
        return
      }
      this.setQueueIndex(0)
      const track = this.track
      const nextTrack = this.nextTrack
      if (!track) return
      await audio.loadTrack({
        url: track.url,
        replayGain: track.replayGain,
        nextUrl: nextTrack?.url,
        fade: true,
        paused: true
      })
    },

    /**
     * Remove all tracks from the queue except the currently playing one.
     * If there is only one track, stop the audio and clear the queue entirely.
     */
    async clearQueue() {
      if (!this.queue) {
        return
      }
      if (this.queue.length > 1) {
        // Keep only the active track
        this.setQueue([this.queue[this.queueIndex]])
        this.setQueueIndex(0)
      } else {
        this.setQueue([])
        this.setQueueIndex(-1)
        await this.stop()
      }
    },

    /**
     * Push the current playback position to the MediaSession API so that
     * lock-screen / notification controls show an accurate scrubber.
     *
     * All parameters are optional; current store values are used as fallbacks.
     */
    async setMediaSessionPosition(_duration?: number, _position?: number) {
      if (!navigator.mediaSession) return
      _duration ??= this.duration
      _position ??= this.currentTime
      navigator.mediaSession.setPositionState({
        duration: _duration,
        playbackRate: mediaSessionProgressRate,
        position: _position
      })
    },

    /**
     * Append tracks to the end of the queue.
     * Deduplicates the trivial case of adding the same single track twice.
     * In shuffle mode the tracks are randomised before appending.
     */
    addToQueue(tracks: Track[]) {
      const lastTrack = this.queue && this.queue.length > 0 ? this.queue[this.queue.length - 1] : null
      if (tracks.length === 1 && tracks[0].id === lastTrack?.id) {
        return
      }
      this.queue?.push(...this.shuffle ? shuffled(tracks) : tracks)
    },

    /**
     * Insert tracks immediately after the current queue position so they play
     * next. Deduplicates if the same single track is already queued next.
     */
    setNextInQueue(tracks: Track[]) {
      if (tracks.length === 1 && tracks[0].id === this.nextTrack?.id) {
        return
      }
      this.queue?.splice(this.queueIndex + 1, 0, ...(this.shuffle ? shuffled(tracks) : tracks))
    },

    /**
     * Remove a track at the given queue index.
     * Adjusts queueIndex to keep the current track pointer correct when a
     * track before the current one is removed.
     */
    removeFromQueue(index: number) {
      this.queue?.splice(index, 1)
      if (index < this.queueIndex) {
        this.queueIndex--
      }
    },

    /**
     * Re-shuffle the entire queue, moving the current track to index 0 so
     * playback is uninterrupted.
     */
    shuffleQueue() {
      if (this.queue && this.queue.length > 0) {
        this.queue = shuffled(this.queue, this.queueIndex)
        this.queueIndex = 0
      }
    },

    /**
     * Cycle through ReplayGain modes (None → Track → Album → None …).
     * Persists the new mode to localStorage.
     */
    toggleReplayGain() {
      const mode = (this.replayGainMode + 1) % ReplayGainMode._Length
      audio.setReplayGainMode(mode)
      this.replayGainMode = mode
      localStorage.setItem('player.replayGainMode', `${mode}`)
    },

    /** Toggle queue repeat and persist to localStorage. */
    toggleRepeat() {
      this.repeat = !this.repeat
      localStorage.setItem('player.repeat', String(this.repeat))
    },

    /** Toggle shuffle mode via setShuffle. */
    toggleShuffle() {
      this.setShuffle(!this.shuffle)
    },

    /** Set master volume, apply to audio controller, persist to localStorage. */
    setVolume(volume: number) {
      audio.setVolume(volume)
      this.volume = volume
      localStorage.setItem('player.volume', String(volume))
    },

    /** Set the shuffle flag and persist to localStorage. */
    setShuffle(toggle: boolean) {
      this.shuffle = toggle
      localStorage.setItem('player.shuffle', String(toggle))
    },

    /** Replace the queue and reset the index to -1. */
    setQueue(queue: Track[]) {
      this.queue = queue
      this.queueIndex = -1
    },

    /**
     * Called when the queue has no more tracks.
     * Hands off to the radio store to continue playback from the last track.
     * Falls back to resetQueue() if radio continuation is unavailable.
     */
    async processQueueEnd() {
      const track = this.track
      if (!track?.url) return

      try {
        const radioStore = useRadioStore()
        await radioStore.continueFromTrack(track)
      } catch {
        this.resetQueue()
      }
    },

    /**
     * Update queueIndex and refresh track-level metadata (duration, MediaSession).
     *
     * Handles edge cases:
     *  - Empty queue → index set to -1
     *  - Index past end with repeat on → wraps to 0
     *  - Index past end with repeat off → stays at last track (no wrap)
     */
    setQueueIndex(index: number) {
      if (!this.queue || this.queue.length === 0) {
        this.queueIndex = -1
        this.duration = 0
        if (mediaSession) {
          mediaSession.playbackState = 'paused'
        }
        return
      }
      index = Math.max(0, index) // Guard against negative indices
      if (index >= this.queue.length) {
        if (this.repeat) {
          index = 0 // Loop back to start
        } else {
          // Stay on the last track; do not advance
          this.queueIndex = this.queue.length - 1
          return
        }
      }
      this.queueIndex = index
      if (!this.track) return

      // Reset scrobble flag so the new track can be scrobbled
      this.scrobbled = false

      // Initialize this.duration & this.currentTime
      this.duration = this.track.duration
      this.currentTime = 0

      // Update lock-screen / notification metadata
      if (mediaSession) {
        const artwork: MediaImage[] = [];
        if (this.track.image) {
          // Provide artwork at multiple resolutions for different OS contexts
          artwork.push(
            { src: this.track.image, sizes: '96x96', type: 'image/png' },
            { src: this.track.image, sizes: '128x128', type: 'image/png' },
            { src: this.track.image, sizes: '192x192', type: 'image/png' },
            { src: this.track.image, sizes: '256x256', type: 'image/png' },
            { src: this.track.image, sizes: '384x384', type: 'image/png' },
            { src: this.track.image, sizes: '512x512', type: 'image/png' }
          );
        }
        navigator.mediaSession.metadata = new MediaMetadata({
          title: this.track.title || '',
          artist: formatArtists(this.track.artists) || '',
          album: this.track.album || '',
          artwork
        });
      }
    },
  },
})

// ---------------------------------------------------------------------------
// setupAudio
// ---------------------------------------------------------------------------
// Called once at app startup to wire the AudioController events to the store
// and register MediaSession action handlers.

export function setupAudio(
  playerStore: ReturnType<typeof usePlayerStore>,
  mainStore: ReturnType<typeof useMainStore>
) {
  // Detect mobile (touch-primary) devices for the auto-resume logic below
  const isMobile =
    matchMedia('(pointer: coarse)').matches &&
    navigator.maxTouchPoints > 0

  // ---------------------------------------------------------------------------
  // Mobile auto-resume
  // ---------------------------------------------------------------------------
  // On iOS/Android the AudioContext is suspended when the browser tab goes to
  // the background. When the tab becomes visible again we poll until the audio
  // resumes by itself or we force a reload from the server queue.

  let resumeToken = false

  function autoResume() {
    // Only attempt auto-resume on mobile, when the user didn't pause manually,
    // and when the page is currently visible
    if (!isMobile || playerStore.wasPaused || resumeToken) return

    resumeToken = true

    const interval = setInterval(async () => {
      if (playerStore.isPlaying === true) {
        // Audio resumed on its own – cancel the polling loop
        clearInterval(interval)
        resumeToken = false
        return
      }

      try {
        // Re-load from the server queue and re-start playback
        await playerStore.loadQueue()
        await playerStore.play()
      } catch {}
    }, 2000)
  }

  // ---------------------------------------------------------------------------
  // Audio event forwarding
  // ---------------------------------------------------------------------------

  // Throttle MediaSession position updates to 2/s to avoid excessive overhead
  const throttledTimeUpdate = throttle((time: number) => {
    playerStore.currentTime = time
    // void playerStore.setMediaSessionPosition()
  }, 100)

  /** Forward the audio element's timeupdate to the store and MediaSession. */
  audio.ontimeupdate = (time: number) => {
    throttledTimeUpdate(time)
  }

  audio.ondurationchange = (duration: number) => {
    playerStore.duration = duration
  }

  // ---------------------------------------------------------------------------
  // Page lifecycle
  // ---------------------------------------------------------------------------

  /** On unload: pause, then persist the queue position to the server. */
  window.addEventListener('beforeunload', () => {
    playerStore.pause()
    const queue = playerStore.queue
    const track = playerStore.track
    const currentTime = playerStore.currentTime
    const duration = playerStore.duration
    // Reset position indicator to 0 so the lock screen doesn't show stale progress
    playerStore.setMediaSessionPosition(duration, currentTime)
    if (mediaSession) mediaSession.playbackState = 'none'
    if (navigator.onLine && queue && track) {
      playerStore.api.savePlayQueue(queue, track, Math.trunc(currentTime))
        .catch(err => { console.info('savePlayQueue aborted:', err) })
    }
  })

  // ---------------------------------------------------------------------------
  // Playback event handlers
  // ---------------------------------------------------------------------------

  /** When a track finishes naturally, advance to the next one or end the queue. */
  audio.onended = async () => {
    const { hasNext, repeat } = playerStore
    if (hasNext || repeat) {
      await playerStore.next(true)
    } else {
      await playerStore.processQueueEnd()
    }
  }

  audio.onplay = () => {
    playerStore.isPlaying = true
    playerStore.setMediaSessionPosition()
    if (mediaSession) mediaSession.playbackState = 'playing'
  }

  audio.onpause = () => {
    playerStore.isPlaying = false
    playerStore.setMediaSessionPosition()
    if (mediaSession) mediaSession.playbackState = 'paused'
    autoResume() // Kick off polling if this was an OS-level pause
  }

  audio.onsuspend = () => {
    playerStore.isPlaying = false
    playerStore.setMediaSessionPosition()
    if (mediaSession) mediaSession.playbackState = 'paused'
    autoResume() // Kick off polling if this was an OS-level pause
  }

  /**
   * Fatal errors only (ABORTED / SRC_NOT_SUPPORTED).
   * Transient network/decode errors are retried internally by AudioController;
   * this fires only once all retries are exhausted via onfailed below,
   * or immediately for errors that are never worth retrying.
   */
  audio.onerror = (error: any) => {
    console.warn('[Audio] Fatal error', error)
    mainStore.setError(error)
    // Skip the broken track rather than looping forever on it.
    if (playerStore.hasNext) {
      void playerStore.next(true)
    } else if (playerStore.hasPrevious) {
      void playerStore.back()
    } else {
      void playerStore.resetQueue()
    }
  }

  /** Fired by AudioController after every retry delay. */
  audio.onretrying = (attempt: number, max: number) => {
    console.info(`[Audio] Network error – retrying (${attempt}/${max})…`)
  }

  /** All retries exhausted without a successful load */
  audio.onfailed = () => {
    console.warn('[Audio] Retries exhausted, waiting for network')
  }

  /** Stall watchdog armed – nothing to do in the store beyond logging. */
  audio.onstalled = () => {
    console.info('[Audio] Playback stalled, watchdog armed')
  }

  /**
   * When the browser goes back online, immediately retry if we're supposed
   * to be playing (the user didn't deliberately pause).
   */
  window.addEventListener('online', () => {
    if (!playerStore.wasPaused) {
      console.info('[Audio] Network restored – retrying current track')
      audio.retryCurrentTrack()
    }
  })

  // ---------------------------------------------------------------------------
  // Initialise audio controller with persisted settings
  // ---------------------------------------------------------------------------

  audio.setReplayGainMode(storedReplayGainMode)
  audio.setVolume(storedVolume)

  // Restore the track that was playing when the page was last open (paused)
  const track = playerStore.track
  const nextTrack = playerStore.nextTrack
  if (track) {
    audio.loadTrack({
      url: track.url,
      replayGain: track.replayGain,
      nextUrl: nextTrack?.url,
      paused: true
    })
  }

  // ---------------------------------------------------------------------------
  // MediaSession action handlers
  // ---------------------------------------------------------------------------
  // These allow OS media controls (lock screen, headphone buttons, etc.)
  // to control playback.

  if (mediaSession) {
    mediaSession.setActionHandler('play', () => { playerStore.play() })
    mediaSession.setActionHandler('pause', () => { playerStore.pause() })
    mediaSession.setActionHandler('nexttrack', () => { playerStore.next(true) })
    mediaSession.setActionHandler('previoustrack', () => { playerStore.back() })
    mediaSession.setActionHandler('stop', () => { playerStore.pause() })

    mediaSession.setActionHandler('seekto', async (details) => {
      // fastSeek is a hint that the browser is still scrubbing; skip those
      if (details.fastSeek || details.seekTime === undefined) return
      const position = Math.min(details.seekTime, playerStore.duration)
      await audio.seek(position)
    })

    mediaSession.setActionHandler('seekforward', (details) => {
      const offset = details.seekOffset || 10
      playerStore.seek(Math.min(playerStore.currentTime + offset, playerStore.duration))
    })

    mediaSession.setActionHandler('seekbackward', (details) => {
      const offset = details.seekOffset || 10
      playerStore.seek(Math.max(playerStore.currentTime - offset, 0))
    })
  }

  // ---------------------------------------------------------------------------
  // Reactive watchers
  // ---------------------------------------------------------------------------

  /**
   * Watch the playback position to handle two concerns:
   *
   * 1. Auto-skip: When fewer than 250 ms remain and there is a next track,
   *    advance early so there is no audible gap between tracks.
   *
   * 2. Scrobbling: Once the user has listened to more than 50% of a track,
   *    report a play to the server (Last.fm-style scrobble).
   */
  watch(
    () => playerStore.currentTime,
    async (time) => {
      const track = playerStore.track
      const isPlaying = playerStore.isPlaying

      // Ignore the first 20 s to avoid false triggers on seek or slow loads
      if (!track || !isPlaying || time < 20) return

      // ── Auto-skip ──────────────────────────────────────────────────────
      const duration = playerStore.duration
      const remaining = duration - time
      if (remaining < 0.25 && playerStore.hasNext) {
        // Guard: only skip once per track
        if (playerStore.skippedTrack === track) return
        playerStore.skippedTrack = track
        await playerStore.next(false) // No fade – the gapless buffer handles the transition
        return
      }

      // ── Scrobble ───────────────────────────────────────────────────────
      const progress = duration ? time / duration : 0
      if (!playerStore.scrobbled && progress > 0.5 && track && isPlaying === true) {
        playerStore.scrobbled = true
        playerStore.api.scrobble(track.id)
      }
    }
  )

  // ---------------------------------------------------------------------------
  // Periodic queue persistence
  // ---------------------------------------------------------------------------
  // Save the play queue to the server every 10 s so the position can be
  // restored on the next page load or on another device.

  setInterval(() => {
    const track = playerStore.track
    const queue = playerStore.queue

    if (!track || !queue) return

    const currentTime = playerStore.currentTime
    playerStore.api.savePlayQueue(queue, track, Math.trunc(currentTime))
      .catch(err => { console.info('savePlayQueue aborted:', err) })
  }, 10000)
}
