// store.ts
import { watch } from 'vue'
import { defineStore } from 'pinia'
import { shuffle, shuffled, trackListEquals, formatArtists, sleep } from '@/shared/utils'
import { Track } from '@/shared/api'
import { AudioController, ReplayGainMode } from '@/player/audio'
import { useMainStore } from '@/shared/store'
import { throttle } from 'lodash-es'
import { useRadioStore } from './radio'

let isMobile = matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0

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

/** ReplayGain mode restored from localStorage, default None (0). */
const storedReplayGainMode = parseInt(localStorage.getItem('player.replayGainMode') ?? '0')

/** Browser MediaSession API (undefined on unsupported browsers). */
const mediaSession: MediaSession | undefined = navigator.mediaSession

/** Singleton Web Audio controller – owns the AudioContext and pipeline. */
const audio = new AudioController()

/**
 * In-flight radio extension (if any). Shared so that two near-simultaneous
 * triggers never start two fetches.
 */
let extending: Promise<boolean> | null = null

// MediaSession requires a non-zero playback rate; 1 = normal speed
const mediaSessionProgressRate = 1

/** How often the active device checks whether another device took over playback. */
const TAKEOVER_POLL_MS = 5000
let takeoverTimer: ReturnType<typeof setInterval> | null = null
let checkingTakeover = false
/** In-flight claim write; takeover checks wait for it so they never read a pre-claim queue. */
let claimPromise: Promise<void> | null = null
/** True once our claim write has actually reached the server. */
let claimConfirmed = false
/** Verbose [session] logging (set to false once the feature is stable). */
const DEBUG_SESSION = false

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
    volume: 1.0,

    /** True while the audio element is actively playing. */
    isPlaying: false,

    /** True once the current track has been scrobbled (sent to the API). */
    scrobbled: false,

    /** True while skipping next/back. */
    inTransition: false,
    /**
     * True when the user explicitly paused.
     * Used by the mobile auto-resume logic to avoid resuming after an
     * OS-level interruption if the user had intentionally paused.
     */
    userPaused: true,

    /**
     * True while THIS device is the user's active playback session (set when
     * playback starts, cleared on pause or when another device takes over).
     * Only the owner writes to the server play queue unconditionally.
     */
    ownsSession: false,

    /** Timestamp (ms) of the last takeover by another device; watch it to show a toast. */
    takeoverAt: 0
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

    /**
     * The track that will play after the current one (wraps only when repeat is on).
     * Kept pure on purpose: the radio extension is triggered by a watcher
     * (see setupAudio), never from here.
     */
    nextTrack(): Track | null {
      if (!this.queue?.length) return null
      // On the last track with repeat off there is no next track (do not wrap),
      // otherwise the gapless preload would queue the first track again.
      if (!this.hasNext && !this.repeat) return null
      return this.queue[(this.queueIndex + 1) % this.queue.length]
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
    /** Append tracks to the end of the queue as-is (no shuffle, no dedupe). */
    appendTracks(tracks: Track[]) {
      if (!tracks.length) return
      this.queue.push(...tracks)
      this.saveQueue()
    },

    /**
     * If the current track is the last one (and repeat is off), ask the radio
     * store to enqueue more tracks so that `nextTrack` exists.
     * Called by the queue watcher (setupAudio) and as a retry in processQueueEnd.
     * Never throws: on failure the queue is simply left unchanged.
     */
    async ensureNextTrack() {
      if (this.hasNext || this.repeat) return
      const track = this.track
      if (!track) return

      if (!extending) {
        extending = useRadioStore()
          .extendQueue(track)
          .catch(err => {
            console.warn('[Radio] queue extension failed', err)
            return false
          })
          .finally(() => { extending = null })
      }
      await extending
    },

    /**
     * Single entry point to load the current queue track into the audio
     * controller. The next URL is passed when already known; if the radio
     * extension finishes later, the nextTrack watcher updates the preload.
     */
    async loadTrack(opts: { fade?: boolean; paused?: boolean } = {}) {
      const track = this.track
      if (!track) return
      await audio.loadTrack({
        url: track.url,
        replayGain: track.replayGain,
        nextUrl: this.nextTrack?.url,
        ...opts
      })
    },

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
      this.inTransition = true
      this.setQueueIndex(index)
      await this.loadTrack({ fade: true })
      this.inTransition = false
    },

    /**
     * Replace the queue (unless it already contains the same tracks) and
     * start playback from the given index.
     *
     * When shuffle is enabled the track list is shuffled in-place so the
     * chosen starting track ends up at index 0.
     */
    async playTrackList(tracks: Track[], index?: number) {
      this.inTransition = true
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
      await this.loadTrack({ fade: true })
      this.inTransition = false
    },

    /** Resume playback and update the MediaSession position state. */
    async play() {
      await audio.resume()
      await audio.play()
    },

    /** Pause playback and update the MediaSession position state. */
    async pause() {
      this.userPaused = true
      await audio.pause()
    },

    async stop() {
      this.userPaused = true
      await audio.stop()
      this.setMediaSessionPosition(0, 0)
      this.setMediaSessionState('none')
    },

    /** Toggle between play and pause. */
    async playPause() {
      if (this.isPlaying) {
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
     * (retry of the radio extension, then fallback to resetQueue()).
     */
    async next(fade = true) {
      if (this.hasNext || this.repeat) {
        this.inTransition = true
        this.setQueueIndex(this.queueIndex + 1)

        await this.loadTrack({ fade })
        this.inTransition = false
        await sleep(200)
        this.setMediaSessionPosition()
        this.setMediaSessionState()
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
        this.inTransition = true
        this.setQueueIndex(this.queueIndex - 1)
        await this.loadTrack({ fade: true })
        this.inTransition = false
        await sleep(200)
        this.setMediaSessionPosition()
        this.setMediaSessionState()
      }
    },

    /** Seek to an absolute position in seconds. */
    async seek(position: number) {
      await audio.seek(position)
      await sleep(200)
      this.setMediaSessionPosition()
      this.setMediaSessionState()
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
      if (!this.track) return
      await this.loadTrack({ fade: true, paused: true }) // Don't auto-play on restore
      await this.seek(currentTrackPosition)
    },

    async saveQueue(opts: { blind?: boolean } = {}) {
      const queue = this.queue
      const track = this.track
      const currentTime = this.currentTime
      if (!navigator.onLine || !queue || !track) return
      try {
        // Never write blindly: another device may have claimed the session since
        // our last check, and overwriting its queue would erase its claim
        // (it would keep playing while we get paused).
        // - owner: if the queue now belongs to someone else, handle the takeover
        // - idle device: only write while the server queue is still ours
        // `blind` skips the check (page unload, where async work is unreliable).
        if (!opts.blind) {
          if (this.ownsSession) {
            if (claimPromise) await claimPromise
            if (!claimConfirmed) {
              // Our claim never landed (e.g. network error right at resume). The
              // server still shows the previous device, which is NOT a takeover:
              // retry the claim instead of pausing ourselves.
              await this.writeClaim()
              return
            }
            if (await this.detectTakeover()) return
          } else if (!(await this.queueIsOurs())) {
            return
          }
        }
        await this.api.savePlayQueue(queue, track, Math.trunc(currentTime))
        // Recovers from a failed claim write (e.g. brief offline at play time)
        if (this.ownsSession && claimConfirmed && !takeoverTimer) this.startTakeoverWatch()
      } catch (err) {
        console.info('savePlayQueue aborted:', err)
      }
    },

    // ── Single active playback session ──────────────────────────────────

    /** True if the server-side play queue was last written by this device. */
    async queueIsOurs(): Promise<boolean> {
      const pq = await this.api.getPlayQueue()
      return this.api.isOwnQueueWriter(pq.changedBy)
    },

    /**
     * Called when playback starts. Writes the queue FIRST (so the server shows
     * us as the last writer), and only then starts polling for a takeover;
     * otherwise the first poll could still see the previous device and
     * pause us straight away.
     */
    async claimSession() {
      if (this.ownsSession) return
      this.ownsSession = true
      claimConfirmed = false
      if (!navigator.onLine || !this.queue?.length || !this.track) return
      // The first request after resume can fail (backgrounded WebView, stale
      // connection), so retry a few times with a short backoff.
      claimPromise = (async () => {
        for (const delay of [0, 400, 1200, 2500, 5000]) {
          if (delay) await sleep(delay)
          if (!this.ownsSession || claimConfirmed) return // released or already done
          if (await this.writeClaim()) return
        }
        console.info('[session] claim failed after retries; will retry on next save')
      })().finally(() => { claimPromise = null })
      await claimPromise
    },

    /** One attempt to write the queue as the active device. True when it landed. */
    async writeClaim(): Promise<boolean> {
      const track = this.track
      if (!navigator.onLine || !this.queue?.length || !track) return false
      try {
        const ok = await this.api.savePlayQueue(this.queue, track, Math.trunc(this.currentTime))
        if (!ok) return false
        if (this.ownsSession) {
          claimConfirmed = true
          if (DEBUG_SESSION) console.info(`[session] claimed as ${this.api.sessionClient}`)
          this.startTakeoverWatch()
        }
        return true
      } catch (err) {
        console.info('[session] claim write failed', err)
        return false
      }
    },

    /** Give up the session WITHOUT writing anything to the server. */
    releaseSession() {
      this.ownsSession = false
      claimConfirmed = false
      this.stopTakeoverWatch()
    },

    /** Called when playback stops: persist the final position, then release. */
    async handlePlaybackStopped() {
      if (!this.ownsSession) return // already released (e.g. takeover)
      await this.saveQueue()
      // Playback may have resumed while the save was in flight
      if (!this.isPlaying) this.releaseSession()
    },

    startTakeoverWatch() {
      this.stopTakeoverWatch()
      takeoverTimer = setInterval(() => { void this.checkTakeover() }, TAKEOVER_POLL_MS)
    },

    stopTakeoverWatch() {
      if (takeoverTimer) clearInterval(takeoverTimer)
      takeoverTimer = null
    },

    /**
     * Returns true when we must NOT write to the queue: another device took
     * the session (we release it and pause) or it was already released.
     */
    async detectTakeover(): Promise<boolean> {
      // Our own claim write must land before we read, or we would see the previous device
      if (claimPromise) await claimPromise
      // Without a confirmed claim the server still names the previous device: not a takeover
      if (!claimConfirmed) return false
      const pq = await this.api.getPlayQueue()
      if (DEBUG_SESSION) {
        console.info(`[session] check: changedBy=${pq.changedBy} me=${this.api.sessionClient} changed=${pq.changed}`)
      }
      if (!this.ownsSession) return true // released while the request was in flight
      if (this.api.isOwnQueueWriter(pq.changedBy)) return false
      console.info(`[session] taken over by ${pq.changedBy} -> pause`)
      this.releaseSession() // first: nothing may write back and trigger a ping-pong
      this.takeoverAt = Date.now()
      await this.pause() // sets userPaused so visibility/device handlers don't resume
      return true
    },

    /** Poll tick: if another device saved the queue since we claimed it, stop playing. */
    async checkTakeover() {
      if (checkingTakeover || !this.ownsSession || !this.isPlaying || !navigator.onLine) return
      checkingTakeover = true
      try {
        await this.detectTakeover()
      } catch {
        // Offline or transient error: try again on the next tick
      } finally {
        checkingTakeover = false
      }
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
      if (!this.track) return
      await this.loadTrack({ fade: true, paused: true })
    },

    /**
     * Remove all tracks from the queue except the currently playing one.
     * If there is only one track, stop the audio and clear the queue entirely.
     */
    async clearQueue() {
      if (!this.queue.length) {
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
      this.saveQueue()
    },

    /**
     * Push the current playback position to the MediaSession API so that
     * lock-screen / notification controls show an accurate scrubber.
     *
     * All parameters are optional; current store values are used as fallbacks.
     */
    async setMediaSessionPosition(_duration?: number, _position?: number) {
      _duration ??= this.duration
      _position ??= this.currentTime
      if (navigator.mediaSession) {
        navigator.mediaSession.setPositionState({
          duration: _duration,
          playbackRate: mediaSessionProgressRate,
          position: _position
        })
      }
    },

    setMediaSessionState(_state?: MediaSessionPlaybackState) {
      if (!_state) {
        _state = this.isPlaying ? 'playing' : 'paused'
      }
      if (navigator.mediaSession) {
        mediaSession!.playbackState = _state
      }
    },

    /**
     * Append tracks to the end of the queue.
     * In shuffle mode the tracks are randomised before appending.
     */
    addToQueue(tracks: Track[]) {
      const lastTrack = this.queue && this.queue.length > 0 ? this.queue[this.queue.length - 1] : null
      if (tracks.length === 1 && tracks[0].id === lastTrack?.id) {
        return
      }
      this.queue?.push(...this.shuffle ? shuffled(tracks) : tracks)
      this.saveQueue()
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
      this.saveQueue()
    },

    /**
     * Remove a track at the given queue index.
     * Adjusts queueIndex to keep the current track pointer correct when a
     * track before the current one is removed.
     *
     * If the removed track was the one currently playing, either skip to the
     * track that takes its place, or stop playback if the queue is now empty.
     */
    async removeFromQueue(index: number) {
      const wasCurrent = index === this.queueIndex

      this.queue = this.queue.filter((_, i) => i !== index)

      if (index < this.queueIndex) {
        this.queueIndex--
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

      // Clamp in case the removed track was the last one in the queue
      this.inTransition = true
      this.setQueueIndex(Math.min(this.queueIndex, this.queue.length - 1))
      if (this.track && this.isPlaying)
        await this.loadTrack({ fade: true })
      this.inTransition = false
      this.saveQueue()
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
     * Safety net, called when the queue ended without a next track (i.e. the
     * radio extension triggered by the queue watcher failed or was not possible).
     * Retries the extension once; falls back to resetQueue().
     */
    async processQueueEnd() {
      if (!this.track?.url) return
      await this.ensureNextTrack()
      if (this.hasNext) {
        await this.next(false)
      } else {
        await this.resetQueue()
      }
    },

    async updateMediaSession(
      trackTitle?: string,
      trackArtist?: string,
      trackAlbum?: string
    ) {
      // Update lock-screen / notification metadata
      const title = trackTitle ?? this.track.title ?? 'Loading ...'
      const artist = trackArtist ?? formatArtists(this.track.artists) ?? ''
      const album = trackAlbum ?? this.track.album ?? ''
      const trackImage = this.track.image || null
      if (mediaSession) {
        const artwork: MediaImage[] = [];
        if (trackImage) {
          // Provide artwork at multiple resolutions for different OS contexts
          artwork.push(
            { src: trackImage, sizes: '96x96', type: 'image/png' },
            { src: trackImage, sizes: '128x128', type: 'image/png' },
            { src: trackImage, sizes: '192x192', type: 'image/png' },
            { src: trackImage, sizes: '256x256', type: 'image/png' },
            { src: trackImage, sizes: '384x384', type: 'image/png' },
            { src: trackImage, sizes: '512x512', type: 'image/png' }
          );
        }
        navigator.mediaSession.metadata = new MediaMetadata({
          title,
          artist,
          album,
          artwork
        });
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
        this.setMediaSessionState('paused')
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

      this.updateMediaSession()
    },
  },
})

// ---------------------------------------------------------------------------
// setupAudio
// ---------------------------------------------------------------------------
// Called once at app startup to wire the AudioController events to the store
// and register MediaSession action handlers.

export async function setupAudio(
  playerStore: ReturnType<typeof usePlayerStore>,
  mainStore: ReturnType<typeof useMainStore>
) {

  function setCodec() {
    const audio = document.createElement('audio')

    const supported = {
      opus: ['audio/ogg; codecs=opus', 'audio/webm; codecs=opus'].some(t => audio.canPlayType(t)),
      aac: Boolean(audio.canPlayType('audio/aac')),
    }

    const preference = ['opus', 'aac']
    const codec = preference.find(c => supported[c]) ?? 'mp3'

    console.info('Codec:', codec)
    localStorage.setItem('audioCodec', codec)
  }

  setCodec()

  // ---------------------------------------------------------------------------
  // Radio extension & gapless preload (reactive)
  // ---------------------------------------------------------------------------

  // Whenever we sit on the last track (repeat off), ask the radio for more.
  // Fires only on actual state changes, so a failed extension does not loop;
  // processQueueEnd() retries once when the track ends.
  watch(
    () => [playerStore.queueIndex, playerStore.queue.length, playerStore.repeat] as const,
    () => {
      if (playerStore.track && !playerStore.hasNext && !playerStore.repeat) {
        void playerStore.ensureNextTrack()
      }
    },
    { immediate: true }
  )

  // Keep the gapless preload in sync with the actual next track
  // (covers radio extensions that finish after loadTrack, and queue edits).
  watch(
    () => playerStore.nextTrack?.url,
    (url) => { audio.setNextUrl(url) }
  )

  // ---------------------------------------------------------------------------
  // Playback event handlers
  // ---------------------------------------------------------------------------

  let playTime = 0
  let pauseTime = 0

  playerStore.setMediaSessionState('none')

  audio.onplay = () => {
    playerStore.isPlaying = true
    playerStore.userPaused = false
    void playerStore.claimSession()
    playTime = Date.now()
    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState('playing')
  }

  audio.onpause = () => {
    playerStore.isPlaying = false
    void playerStore.handlePlaybackStopped()
    pauseTime = Date.now()
    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState('paused')
  }

  audio.onwaiting = () => {
    playerStore.isPlaying = false
    pauseTime = Date.now()
    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState('paused')
    playerStore.updateMediaSession("Loading ...", "", "")
  }

  audio.onplaying = () => {
    playerStore.isPlaying = true
    playerStore.userPaused = false
    playTime = Date.now()
    playerStore.setMediaSessionPosition()
    playerStore.setMediaSessionState('playing')
    playerStore.updateMediaSession()
  }

  audio.onended = async () => {
    const { hasNext, repeat } = playerStore
    if (hasNext || repeat) {
      await playerStore.next(false)
    } else {
      await playerStore.processQueueEnd()
    }
  }

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

  document.addEventListener('visibilitychange', () => {
    if (playerStore.isPlaying) return

    switch (document.visibilityState) {
      case 'visible':
        if (!playerStore.userPaused) {
          playerStore.play()
        }
        break
      case 'hidden':
        // Handle hidden state if needed in the future
        break
    }
  })

  // ── Output devices (Bluetooth, headphones…) ─────────────────────────────

  /** Snapshot of current audio device IDs (excluding virtual defaults). */
  const getDeviceIds = async (): Promise<Set<string>> => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return new Set(
      devices
        .filter(d => d.kind === 'audiooutput' || d.kind === 'audioinput')
        .map(d => `${d.kind}:${d.deviceId}:${d.label}`)
        .filter(id => !id.includes(':default:') && !id.includes(':communications:'))
    )
  }

  let knownOutputs = await getDeviceIds()

  // Pause when a device is removed, play when one is added
  const onDeviceChange = throttle(async () => {
    console.info('[devices] change')
    if (playerStore.userPaused) return
    const current = await getDeviceIds()
    const added = [...current].some(id => !knownOutputs.has(id))
    const removed = [...knownOutputs].some(id => !current.has(id))
    knownOutputs = current

    if (removed && Date.now() - playTime > 1000) {
      console.info('[devices] output removed -> pause')
      await audio.pause()
    } else if (added && Date.now() - pauseTime > 1000) {
      console.info('[devices] output added -> play')
      await playerStore.play()
    }
  }, 500, { leading: false, trailing: true })

  navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)

  // ── Microphone permission (exposes device labels) ───────────────────────

  /** Request mic permission, then release the stream. */
  const requestMicAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
      knownOutputs = await getDeviceIds() // re-baseline now that IDs are exposed
      console.info('[devices] mic permission granted')
    } catch (err) {
      console.warn('[devices] mic permission unavailable:', err)
    }
  }

  /** Ask for mic permission on the first user gesture, if not already decided. */
  const ensureMicAccess = async () => {
    let state: PermissionState = 'prompt'
    try {
      state = (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state
    } catch {
      // Not supported (e.g. Safari)
    }
    if (state === 'granted') {
      knownOutputs = await getDeviceIds()
      return
    }
    if (state === 'denied') return

    const onGesture = () => {
      window.removeEventListener('pointerdown', onGesture, true)
      window.removeEventListener('keydown', onGesture, true)
      void requestMicAccess()
    }
    window.addEventListener('pointerdown', onGesture, true)
    window.addEventListener('keydown', onGesture, true)
  }

  void ensureMicAccess()

  if (!isMobile) { // is Desktop
    window.addEventListener('keydown', async (event) => {
      // Ignore when typing in inputs/textareas
      const target = event.target as HTMLElement | null
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        await playerStore.playPause()
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault()
        await playerStore.back()
      } else if (event.code === 'ArrowRight') {
        event.preventDefault()
        await playerStore.next(true)
      }
    })
  }

  let saveTime = 0
  audio.ontimeupdate = (time: number) => {
    if (playerStore.inTransition) return
    playerStore.currentTime = time

    const track = playerStore.track
    const isPlaying = playerStore.isPlaying

    const now = Date.now()
    if (now - saveTime > 10000) {
      saveTime = now
      playerStore.saveQueue()
    }

    // Ignore the first 20 s to avoid false triggers on seek or slow loads
    if (!track || !isPlaying || time < 20) return

    const duration = playerStore.duration

    // ── Auto-skip ──────────────────────────────────────────────────────
    const remaining = duration - time
    if (remaining < 0.15 && playerStore.hasNext) {
      playerStore.next(false) // No fade – the gapless buffer handles the transition
      return
    }

    // ── Scrobble ───────────────────────────────────────────────────────
    const progress = duration ? time / duration : 0
    if (!playerStore.scrobbled && progress > 0.5 && track && isPlaying) {
      playerStore.scrobbled = true
      playerStore.api.scrobble(track.id)
    }
  }

  audio.ondurationchange = (duration: number) => {
    playerStore.duration = duration
    playerStore.setMediaSessionPosition()
  }

  // ---------------------------------------------------------------------------
  // Page lifecycle
  // ---------------------------------------------------------------------------

  /** On unload: pause, then persist the queue position to the server. */
  window.addEventListener('beforeunload', (event) => {
    // Only the active device saves on unload. An idle device already saved
    // when it paused, and writing now would steal the session.
    if (playerStore.ownsSession) playerStore.saveQueue({ blind: true })

    // Show confirmation dialog if playback is active
    if (playerStore.isPlaying) {
      event.preventDefault()
      event.returnValue = ''
      return ''
    }
  })

  // ---------------------------------------------------------------------------
  // Initialise audio controller with persisted settings
  // ---------------------------------------------------------------------------

  audio.setReplayGainMode(storedReplayGainMode)
  audio.setVolume(playerStore.volume)

  // Restore the track that was playing when the page was last open (paused)
  if (playerStore.track) {
    await playerStore.loadTrack({ paused: true })
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
      playerStore.seek(position)
    })
    mediaSession.setActionHandler('seekforward', (details) => {
      const offset = details.seekOffset || 10
      const position = Math.min(playerStore.currentTime + offset, playerStore.duration)
      playerStore.seek(position)
    })
    mediaSession.setActionHandler('seekbackward', (details) => {
      const offset = details.seekOffset || 10
      const position = Math.max(playerStore.currentTime - offset, 0)
      playerStore.seek(position)
    })
  }
}
