import { sleep } from '@/shared/utils'
import { useCacheStore } from '@/player/cache'

// ---------------------------------------------------------------------------
// ReplayGain
// ---------------------------------------------------------------------------
// ReplayGain is a standard that stores loudness metadata alongside audio
// tracks so the player can normalise perceived volume across songs/albums.

export enum ReplayGainMode {
  None,   // No gain correction – play audio as-is
  Track,  // Normalise each track independently
  Album,  // Normalise relative to the full album (preserves dynamic contrast)
  _Length // Sentinel value – used to cycle through modes with modulo
}

/** Per-track / per-album ReplayGain metadata stored in the audio file tags. */
type ReplayGain = {
  trackGain: number // dB adjustment for a single track
  trackPeak: number // Peak sample value for a single track (0–1)
  albumGain: number // dB adjustment relative to the full album
  albumPeak: number // Peak sample value for the full album
}

// ---------------------------------------------------------------------------
// Web Audio pipeline
// ---------------------------------------------------------------------------
// Each track is routed through a fixed graph:
//
//  MediaElementSource
//    └─► volumeNode        (master volume, persisted in localStorage)
//          └─► replayGainNode   (dB normalisation via ReplayGain metadata)
//                └─► fadeNode        (short linear ramp on play/pause/seek)
//                      └─► normalizerNode   (soft-knee compressor for peak limiting)
//                            └─► AudioContext.destination

type AudioPipeline = {
  audio: HTMLAudioElement
  volumeNode: GainNode
  replayGainNode: GainNode
  fadeNode: GainNode
  normalizerNode: DynamicsCompressorNode
  /** Disconnects all nodes and releases the audio element's src. */
  dispose(): void
}

// ---------------------------------------------------------------------------
// AudioController
// ---------------------------------------------------------------------------
// Owns a single AudioContext and one AudioPipeline at a time.
// When a new track is loaded the current pipeline is disposed and replaced.
// A pre-buffered HTMLAudioElement (this.buffer) is promoted to the new
// pipeline, which eliminates the gap between consecutive tracks.

export class AudioController {
  /** Duration of the cross-fade / fade-in-out in seconds. */
  private fadeTime = 0.3

  /**
   * Monotonically increasing counter that is bumped on every loadTrack() call.
   * Async operations capture the token at start and abort if it no longer
   * matches, preventing race conditions when tracks are changed rapidly.
   */
  private changeToken = 0

  /**
   * Pre-loaded HTMLAudioElement for the *next* track.
   * Populated 15 s after a track starts playing so the browser has time to
   * buffer the upcoming URL before it is needed.
   */
  private buffer: HTMLAudioElement | null = null

  private replayGainMode = ReplayGainMode.None
  private replayGain: ReplayGain | null = null

  private _context: AudioContext | null = null

  private pipeline: AudioPipeline | null = null

  // ── Retry state ───────────────────────────────────────────────────────────
  private lastLoadOptions: {
    url?: string; nextUrl?: string; paused?: boolean
    replayGain?: ReplayGain; fade?: boolean
  } | null = null
  private retryCount = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private readonly maxRetries = 4
  /** Exponential back-off delays in ms: 2 s, 4 s, 8 s, 16 s */
  private readonly retryDelays = [2_000, 4_000, 8_000, 16_000] as const

  private get activePipeline(): AudioPipeline {
    if (!this.pipeline) {
      this.pipeline = createPipeline(this.context, {})
    }
    return this.pipeline
  }

  private get context(): AudioContext {
    if (!this._context) {
      this._context = new AudioContext()
    }
    return this._context
  }

  // ── Callbacks (assigned by the store via setupAudio) ──────────────────────
  ontimeupdate = (_: number) => {}
  ondurationchange = (_: number) => {}
  onpause = () => {}
  onplay = () => {}
  onended = () => {}
  onsuspend = () => {}
  onerror = (_: MediaError | null) => {}
  /** Fired on each retry attempt. */
  onretrying = (_attempt: number, _max: number) => {}
  /** Fired when all retries are exhausted without success. */
  onfailed = () => {}
  /** Fired when the browser stops fetching (stall watchdog armed). */
  onstalled = () => {}

  // ── Public accessors ──────────────────────────────────────────────────────

  get audioElement(): HTMLAudioElement | undefined {
    return this.activePipeline.audio
  }

  currentTime() {
    return this.activePipeline.audio.currentTime
  }

  duration() {
    return this.activePipeline.audio.duration
  }

  // ── Caching / buffering ───────────────────────────────────────────────────

  /** Ask the cache store to persist the track URL in the service-worker cache. */
  async cacheTrack(url: string) {
    const cacheStore = useCacheStore()
    cacheStore.cacheTrack(url!)
  }

  /**
   * Create and pre-load an HTMLAudioElement for the given URL so it is
   * ready to be promoted into the next pipeline without a network round-trip.
   */
  async setBuffer(url: string) {
    this.buffer = new Audio()
    this.buffer.crossOrigin = 'anonymous'
    this.buffer.preload = 'auto'
    this.buffer.src = url
    try { this.buffer.load() } catch {}
  }

  // ── Volume & ReplayGain ───────────────────────────────────────────────────

  /** Set master volume (0–1). Applied directly to the volumeNode gain. */
  setVolume(value: number) {
    this.activePipeline.volumeNode.gain.value = value
  }

  /**
   * Switch ReplayGain mode and reconfigure the compressor accordingly.
   * In None mode the compressor is effectively bypassed (ratio 1:1, 0 dB threshold).
   */
  setReplayGainMode(value: ReplayGainMode) {
    this.replayGainMode = value
    this.activePipeline.replayGainNode.gain.value = this.replayGainFactor()

    if (value === ReplayGainMode.None) {
      // Bypass the compressor: flat unity-gain passthrough
      this.activePipeline.normalizerNode.threshold.value = 0
      this.activePipeline.normalizerNode.knee.value = 0
      this.activePipeline.normalizerNode.ratio.value = 1
    } else {
      // Soft-knee limiting: gently clamp peaks above -3 dBFS
      this.activePipeline.normalizerNode.threshold.value = -3
      this.activePipeline.normalizerNode.knee.value = 3
      this.activePipeline.normalizerNode.ratio.value = 2
      this.activePipeline.normalizerNode.attack.value = 0.01  // 10 ms attack
      this.activePipeline.normalizerNode.release.value = 0.1  // 100 ms release
    }
  }

  // ── Playback control ──────────────────────────────────────────────────────

  /** Stop playback entirely and tear down the pipeline. */
  async stop() {
    this.changeToken++
    this.cancelRetry()
    this.disposePipeline(this.activePipeline)
    this._context = null
  }

  /** Fade out, then pause the underlying HTMLAudioElement. */
  async pause() {
    const audio = this.activePipeline.audio
    await this.fadeOut(this.fadeTime)
    audio.pause()
  }

  /** Resume the AudioContext if suspended (auto-play policy), then fade in. */
  async play() {
    if (this.context.state === 'suspended') {
      await this.context.resume()
    }
    await this.activePipeline.audio.play()
    await this.fadeIn(this.fadeTime / 2)
  }

  /** Seek to an absolute position (seconds). Fades out/in when playing. */
  async seek(value: number) {
    if (!this.activePipeline.audio.paused) {
      this.fadeOut(this.fadeTime / 2)
    }
    this.activePipeline.audio.currentTime = value
    if (!this.activePipeline.audio.paused) {
      this.fadeIn(this.fadeTime / 2)
    }
  }

  // ── Retry helpers ─────────────────────────────────────────────────────────

  /**
   * Re-load the last track without fade.
   * Called by the retry scheduler and by the online event listener in the store.
   */
  retryCurrentTrack() {
    if (this.lastLoadOptions) {
      void this.loadTrack({ ...this.lastLoadOptions, fade: false })
    }
  }

  private cancelRetry() {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  private scheduleRetry() {
    if (this.retryCount >= this.maxRetries) {
      this.retryCount = 0
      this.onfailed()
      return
    }
    const delay = this.retryDelays[this.retryCount]
    this.onretrying(this.retryCount + 1, this.maxRetries)
    this.retryCount++
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.retryCurrentTrack()
    }, delay)
  }

  // ── Track loading ─────────────────────────────────────────────────────────

  /**
   * Load a new track into the pipeline.
   *
   * Steps:
   *  1. Bump changeToken so any in-flight loads are abandoned.
   *  2. Re-use this.buffer if it already holds the right URL, otherwise
   *     create a new buffered Audio element.
   *  3. Build a fresh AudioPipeline around that element.
   *  4. Optionally fade out the old pipeline before swapping.
   *  5. Wire up all HTML5 audio event handlers.
   *  6. Start playback (unless paused: true).
   *  7. After 15 s, cache the current URL and start pre-buffering the next.
   */
  async loadTrack(options: {
    url?: string
    nextUrl?: string
    paused?: boolean
    replayGain?: ReplayGain
    fade?: boolean
  }) {
    if (!options.url) return
    const currentUrl = options.url
    const nextUrl = options.nextUrl
    const cacheStore = useCacheStore()

    // Capture token before any await so we can detect stale loads later
    const token = ++this.changeToken

    // Reset retry state for a fresh load request
    this.cancelRetry()
    this.retryCount = 0
    this.lastLoadOptions = options // Save for retries

    this.replayGain = options.replayGain ?? null

    // Re-use existing buffer if possible to avoid redundant network requests
    if (!this.buffer || this.buffer.src !== currentUrl || this.buffer.error) {
      const playable = await cacheStore.getPlayableUrl(currentUrl)
      await this.setBuffer(playable)
      console.info('setBuffer(1):', currentUrl)
    }

    // Build the new pipeline using the buffered audio element
    const nextPipeline = createPipeline(this.context, {
      audio: this.buffer!,
      volume: this.activePipeline.volumeNode.gain.value,
      replayGain: this.replayGainFactor()
    })

    // Abort if another loadTrack() was called while we were awaiting
    if (token !== this.changeToken) {
      nextPipeline.dispose()
      return
    }

    let playbackTransition = true

    if (options.fade) {
      await this.fadeOut(this.fadeTime)
    }

    // Swap pipelines – old one is disposed after a short delay
    this.replacePipeline(nextPipeline)
    this.setReplayGainMode(this.replayGainMode)

    const audio = this.activePipeline.audio

    // ── Stall watchdog ────────────────────────────────────────────────────
    // If the audio element stalls or runs out of buffer for >10 s while we
    // expect it to be playing, check for cached data before retrying.
    let stalledTimer: ReturnType<typeof setTimeout> | null = null

    const clearStalledTimer = () => {
      if (stalledTimer !== null) { clearTimeout(stalledTimer); stalledTimer = null }
    }

    /**
     * If the audio element already has enough buffered data ahead of the
     * current position, play from it directly (no network needed).
     * Otherwise schedule a retry with exponential back-off.
     */
    const playFromBufferOrRetry = () => {
      const bufferedUpTo = audio.buffered.length > 0
        ? audio.buffered.end(audio.buffered.length - 1)
        : 0
      if (bufferedUpTo > audio.currentTime + 1) {
        // Data is already in memory – play from cache, skip the network entirely
        void audio.play().catch(() => this.scheduleRetry())
      } else {
        this.scheduleRetry()
      }
    }

    const armStalledTimer = () => {
      if (playbackTransition) return
      clearStalledTimer()
      if (token !== this.changeToken) return
      this.onstalled()
      stalledTimer = setTimeout(() => {
        stalledTimer = null
        if (token !== this.changeToken || audio.paused) return
        playFromBufferOrRetry()
      }, 10_000)
    }

    // ── Event handlers ────────────────────────────────────────────────────
    audio.onerror = () => {
      clearStalledTimer()
      const code = audio.error?.code
      if (code === MediaError.MEDIA_ERR_ABORTED) {
        this.onerror(audio.error)
      } else {
        playFromBufferOrRetry()
      }
    }
    audio.onended    = () => { clearStalledTimer(); this.onended() }
    audio.onpause    = () => { clearStalledTimer(); this.onpause() }
    audio.onplay     = () => this.onplay()
    audio.onstalled  = armStalledTimer
    audio.onwaiting  = armStalledTimer
    audio.onplaying = () => { playbackTransition = false; clearStalledTimer() }
    audio.onseeking = () => { playbackTransition = true }
    audio.ontimeupdate = () => this.ontimeupdate(audio.currentTime)

    // Fire ondurationchange once the metadata has been parsed
    audio.addEventListener('loadedmetadata', () => {
      const d = audio.duration
      if (Number.isFinite(d) && d > 0) {
        this.ondurationchange(d)
      }
    })

    // Force metadata load if not already ready
    if (audio.readyState < 1) {
      try { audio.load() } catch {}
    }

    if (!options.paused) {
      try {
        await this.play()
      } catch (err: any) {
        // AbortError is expected if play() is interrupted by a rapid track change
        if (err.name !== 'AbortError') throw err
      }
    }

    // After 15 s, cache the playing track and pre-buffer the next one
    setTimeout(async () => {
      if (token === this.changeToken) {
        this.cacheTrack(currentUrl!)
        if (nextUrl) {
          const nextPlayable = await cacheStore.getPlayableUrl(nextUrl)
          this.setBuffer(nextPlayable)
          console.info('setBuffer(2):', nextUrl)
        }
      }
    }, Math.min(15000, (this.activePipeline.audio.duration || 30) * 0.5 * 1000))
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** Swap the active pipeline, disposing the old one. */
  private replacePipeline(next: AudioPipeline) {
    this.disposePipeline(this.activePipeline)
    this.pipeline = next
  }

  /**
   * Remove all event listeners from a pipeline's audio element and schedule
   * its Web Audio nodes for disconnection after a short grace period so that
   * any in-progress audio chunk can finish decoding.
   */
  private disposePipeline(pipeline: AudioPipeline) {
    pipeline.audio.onended          = null
    pipeline.audio.onerror          = null
    pipeline.audio.onpause          = null
    pipeline.audio.onplay           = null
    pipeline.audio.onplaying        = null
    pipeline.audio.onstalled        = null
    pipeline.audio.onwaiting        = null
    pipeline.audio.ontimeupdate     = null
    pipeline.audio.ondurationchange = null

    // Small delay to let the current audio frame finish before disconnecting
    setTimeout(() => pipeline.dispose(), 500)
  }

  /** Linearly ramp the fade node from its current value to 1 over `duration` seconds. */
  private async fadeIn(duration = 0) {
    const gain = this.activePipeline.fadeNode.gain
    const now = this.context.currentTime
    gain.cancelScheduledValues(0)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(1, now + duration)
    await sleep(duration * 1000)
  }

  /** Linearly ramp the fade node from its current value to 0 over `duration` seconds. */
  private async fadeOut(duration = 0) {
    const gain = this.activePipeline.fadeNode.gain
    const now = this.context.currentTime
    gain.cancelScheduledValues(0)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(0, now + duration)
    await sleep(duration * 1000)
  }

  /**
   * Calculate the linear gain multiplier to apply for the current ReplayGain
   * mode, respecting the per-track or per-album peak so we never clip.
   *
   * Formula:  gain_linear = min(10^((dBGain + preAmp) / 20), 1 / peak)
   * The preAmp (+6 dB) adds a fixed positive offset so quiet tracks are
   * brought up without requiring the dBGain value to be abnormally large.
   */
  private replayGainFactor(): number {
    if (this.replayGainMode === ReplayGainMode.None || !this.replayGain) {
      return 1
    }

    const gain =
      this.replayGainMode === ReplayGainMode.Track
        ? this.replayGain.trackGain
        : this.replayGain.albumGain

    const peak =
      this.replayGainMode === ReplayGainMode.Track
        ? this.replayGain.trackPeak
        : this.replayGain.albumPeak

    if (!Number.isFinite(gain) || !Number.isFinite(peak) || peak <= 0) {
      return 1 // Fall back to unity gain if metadata is missing or invalid
    }

    const preAmp = 6 // dB – boosts overall loudness before peak limiting
    return Math.min(
      Math.pow(10, (gain + preAmp) / 20),
      1 / peak
    )
  }
}

// ---------------------------------------------------------------------------
// Pipeline factory
// ---------------------------------------------------------------------------

/**
 * Create a fresh Web Audio pipeline for a given HTMLAudioElement.
 * All nodes are connected in series and wired to the AudioContext destination.
 *
 * @param context  - Shared AudioContext (created once per AudioController)
 * @param options  - Optional seed values; defaults to a silent, un-sourced pipeline
 */
function createPipeline(
  context: AudioContext,
  {
    audio = new Audio(),
    volume = 1,
    replayGain = 1
  }: {
    audio?: HTMLAudioElement
    volume?: number
    replayGain?: number
  }
): AudioPipeline {
  audio.playbackRate = 1

  // Wrap the HTMLAudioElement in a Web Audio source node
  const source = context.createMediaElementSource(audio)
  const volumeNode = context.createGain()
  const replayGainNode = context.createGain()
  const fadeNode = context.createGain()
  const normalizerNode = context.createDynamicsCompressor()

  // Set initial gain values
  volumeNode.gain.value = volume
  replayGainNode.gain.value = replayGain
  fadeNode.gain.value = 1            // Fully open – fades are applied at runtime
  normalizerNode.threshold.value = 0 // Flat until setReplayGainMode() configures it

  // Wire the signal chain
  source
    .connect(volumeNode)
    .connect(replayGainNode)
    .connect(fadeNode)
    .connect(normalizerNode)
    .connect(context.destination)

  /** Disconnect every node and free the audio element's src. */
  function dispose() {
    audio.pause()
    source.disconnect()
    volumeNode.disconnect()
    replayGainNode.disconnect()
    fadeNode.disconnect()
    normalizerNode.disconnect()
    audio.src = ''
    try { audio.load() } catch {}
  }

  return {
    audio,
    volumeNode,
    replayGainNode,
    fadeNode,
    normalizerNode,
    dispose
  }
}
