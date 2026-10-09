// exo.ts
// Native Android (Capacitor) replacement for audio.ts, backed by Media3 ExoPlayer.
//
// ExoController exposes the same public surface as AudioController so that
// store.ts only has to pick one or the other at startup.
//
// What stays identical to audio.ts:
//   - callbacks (onplay, onpause, onended, onerror, onplaying, onwaiting,
//     ontimeupdate, ondurationchange)
//   - ReplayGain maths (replayGainFactor(), same +6 dB preAmp and 1/peak clamp)
//   - volume, short fade in/out on play/pause/seek/track change
//   - cache integration (cache store resolves the playable URI)
//   - next-track pre-buffering (a second paused ExoPlayer, promoted on load)
//
// What is dropped:
//   - the DynamicsCompressor "normalizer" (Web Audio only). Clipping is still
//     prevented by the 1/peak clamp in replayGainFactor().

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { useCacheStore } from '@/shared/cache'
import { ReplayGainMode, type AudioController } from '@/player/audio'

/** Public shape of AudioController (keyof only exposes public members). */
export type AudioEngine = Pick<AudioController, keyof AudioController>

type ReplayGain = {
  trackGain: number
  trackPeak: number
  albumGain: number
  albumPeak: number
}

// ---------------------------------------------------------------------------
// Native plugin contract (see ExoPlayerPlugin.java)
// ---------------------------------------------------------------------------

interface ExoPlayerPlugin {
  /** Swap in a new track (re-using the preloaded one if `key` matches). */
  load(o: {
    url: string        // file:// URI (cached) or remote URL
    key: string        // original remote URL, identifies the track
    paused: boolean
    fade: boolean
    fadeOutMs: number
    volume: number     // user volume 0..1
    gain: number       // linear ReplayGain factor (may be > 1)
    startPosition?: number // seconds, optional initial seek
  }): Promise<void>
  preload(o: { url: string; key: string }): Promise<void>
  play(o: { fadeInMs: number }): Promise<void>
  pause(o: { fadeOutMs: number }): Promise<void>
  stop(): Promise<void>
  seek(o: { position: number; fadeMs: number }): Promise<void>
  setLevels(o: { volume?: number; gain?: number }): Promise<void>

  addListener(
    event: 'play' | 'pause' | 'playing' | 'waiting' | 'ended',
    cb: () => void
  ): Promise<PluginListenerHandle>
  addListener(
    event: 'time',
    cb: (e: { position: number; duration: number }) => void
  ): Promise<PluginListenerHandle>
  addListener(
    event: 'duration',
    cb: (e: { duration: number }) => void
  ): Promise<PluginListenerHandle>
  addListener(
    event: 'error',
    cb: (e: { code?: number; message?: string }) => void
  ): Promise<PluginListenerHandle>
}

const Exo = registerPlugin<ExoPlayerPlugin>('ExoPlayer')

const warn = (e: unknown) => console.warn('[Exo]', e)

// ---------------------------------------------------------------------------
// ExoController
// ---------------------------------------------------------------------------

export class ExoController implements AudioEngine {
  /** Duration of the fade in/out in seconds (same value as audio.ts). */
  private fadeTime = 0.3

  /** Bumped on every loadTrack() so stale async loads can abort. */
  private changeToken = 0

  private replayGainMode = ReplayGainMode.None
  private replayGain: ReplayGain | null = null
  private volume = 1
  private _position = 0
  private _duration = 0

  /** Pending seek target (s): stale position events are dropped until reached. */
  private seekTarget: number | null = null

  /** Track currently loaded: original URL + the URI actually handed to ExoPlayer. */
  private currentKey = ''
  private currentPlayable = ''
  private playing = false

  /**
   * Seek requested on a remote track ExoPlayer may not be able to seek in.
   * Resolved by switching to the cached local file as soon as it is available.
   */
  private pending: { key: string; position: number; at: number } | null = null
  private seekAt = 0

  // ── Callbacks (assigned by the store via setupAudio) ──────────────────────
  ontimeupdate = (_: number) => {}
  ondurationchange = (_: number) => {}
  onpause = () => {}
  onplay = () => {}
  onended = () => {}
  onerror = (_?: any) => {}
  onplaying = () => {}
  onwaiting = () => {}

  constructor() {
    // Callbacks are looked up at call time, so the store can (re)assign them
    // after construction.
    Exo.addListener('play', () => { this.playing = true; this.onplay() }).catch(warn)
    Exo.addListener('pause', () => { this.playing = false; this.onpause() }).catch(warn)
    Exo.addListener('playing', () => this.onplaying()).catch(warn)
    Exo.addListener('waiting', () => this.onwaiting()).catch(warn)
    Exo.addListener('ended', () => this.onended()).catch(warn)

    // The cache store dispatches this when a track has been fully written to disk
    window.addEventListener('audioCached', (e) => {
      void this.onCached((e as CustomEvent).detail)
    })

    Exo.addListener('time', ({ position, duration }) => {
      if (this.pending && this.pending.key === this.currentKey) {
        const p = this.pending
        const elapsed = this.playing ? (Date.now() - p.at) / 1000 : 0
        if (Math.abs(position - (p.position + elapsed)) < 1.5) {
          // ExoPlayer managed to seek natively: nothing more to do
          this.pending = null
          this.seekTarget = null
        } else if (Date.now() - p.at < 60000) {
          // Seek not applied (yet): keep the bar where the user dropped it
          this.ontimeupdate(p.position + elapsed)
          return
        } else {
          this.pending = null
        }
      }
      if (this.seekTarget !== null) {
        const reached = Math.abs(position - this.seekTarget) < 1.5
        if (!reached && Date.now() - this.seekAt < 3000) return // stale tick
        this.seekTarget = null
      }
      this._position = position
      if (Number.isFinite(duration) && duration > 0) this._duration = duration
      this.ontimeupdate(position)
    }).catch(warn)

    Exo.addListener('duration', ({ duration }) => {
      if (Number.isFinite(duration) && duration > 0) {
        this._duration = duration
        this.ondurationchange(duration)
      }
    }).catch(warn)

    Exo.addListener('error', (e) => {
      console.warn('[Exo] playback error', e)
      this.onerror(e)
    }).catch(warn)
  }

  // ── Public accessors ──────────────────────────────────────────────────────

  /** There is no HTMLAudioElement in native mode. */
  get audioElement(): HTMLAudioElement | undefined {
    return undefined
  }

  currentTime() {
    return this._position
  }

  duration() {
    return this._duration
  }

  // ── Caching / buffering ───────────────────────────────────────────────────

  /** Ask the cache store to persist the track URL on the native filesystem. */
  async cacheTrack(url: string) {
    const cacheStore = useCacheStore()
    cacheStore.cacheTrack(url!)
  }

  /**
   * Pre-load `url` into a second, paused ExoPlayer so that the next loadTrack()
   * can promote it without a network round-trip.
   */
  async setBuffer(url: string) {
    const cacheStore = useCacheStore()
    const playable = await cacheStore.getCachedUrl(url, true)
    try {
      await Exo.preload({ url: playable, key: url })
    } catch (e) {
      warn(e)
    }
  }

  // ── Volume & ReplayGain ───────────────────────────────────────────────────

  /** Set master volume (0–1). */
  setVolume(value: number) {
    this.volume = value
    Exo.setLevels({ volume: value }).catch(warn)
  }

  /** Switch ReplayGain mode and push the new linear gain to the player. */
  setReplayGainMode(value: ReplayGainMode) {
    this.replayGainMode = value
    Exo.setLevels({ gain: this.replayGainFactor() }).catch(warn)
  }

  // ── Playback control ──────────────────────────────────────────────────────

  async stop() {
    this.changeToken++
    await Exo.stop()
    console.info('audio.stop()')
  }

  /** Fade out, then pause. */
  async pause() {
    await Exo.pause({ fadeOutMs: Math.round(this.fadeTime * 1000) })
    console.info('audio.pause()')
  }

  /** Play, then fade in. */
  async play() {
    await Exo.play({ fadeInMs: Math.round((this.fadeTime / 2) * 1000) })
    console.info('audio.play()')
  }

  /** No AudioContext to resume in native mode. */
  async resume() {}

  /** Seek to an absolute position (seconds), with a short dip to avoid clicks. */
  async seek(value: number) {
    this._position = value
    this.seekTarget = value
    this.seekAt = Date.now()
    this.ontimeupdate(value) // optimistic: keep the progress bar where the user dropped it

    // A remote HTTP stream (transcoded / no Range support) may not be seekable
    // in ExoPlayer. Use the cached local file when it exists; otherwise remember
    // the seek, make caching of this track a priority, and apply the seek as
    // soon as the file is on disk (see onCached()).
    this.pending = null
    if (this.currentKey && !this.currentPlayable.startsWith('file:')) {
      const token = this.changeToken
      if (await this.switchToLocal(value)) return
      if (token !== this.changeToken) return
      this.pending = { key: this.currentKey, position: value, at: Date.now() }
      void useCacheStore().cacheTrack(this.currentKey, true)
    }
    await Exo.seek({ position: value, fadeMs: Math.round((this.fadeTime / 2) * 1000) })
  }

  /** Reload the current track from its cached local file at `position` (s). */
  private async switchToLocal(position: number): Promise<boolean> {
    const token = this.changeToken
    const local = await useCacheStore().getCachedUrl(this.currentKey, true)
    if (token !== this.changeToken || !local.startsWith('file:')) return false
    this.currentPlayable = local
    try {
      await Exo.load({
        url: local,
        key: this.currentKey,
        paused: !this.playing,
        fade: false,
        fadeOutMs: 0,
        volume: this.volume,
        gain: this.replayGainFactor(),
        startPosition: position
      })
    } catch (e) {
      warn(e)
    }
    return true
  }

  /** Called when the cache store finished writing `url` to disk. */
  private async onCached(url: string) {
    const p = this.pending
    if (!p || url !== p.key || p.key !== this.currentKey) return
    this.pending = null
    const pos = p.position + (this.playing ? (Date.now() - p.at) / 1000 : 0)
    this.seekTarget = pos
    this.seekAt = Date.now()
    await this.switchToLocal(pos)
  }

  // ── Track loading ─────────────────────────────────────────────────────────

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

    const token = ++this.changeToken

    this.replayGain = options.replayGain ?? null
    this._position = 0
    this._duration = 0
    this.seekTarget = null
    this.pending = null

    // file:// URI when cached, remote URL otherwise (also queues caching)
    const playable = await cacheStore.getCachedUrl(currentUrl, true)
    console.info('exo.load:', playable)
    this.currentKey = currentUrl
    this.currentPlayable = playable

    // Another loadTrack() started while we were resolving the URL
    if (token !== this.changeToken) return

    try {
      await Exo.load({
        url: playable,
        key: currentUrl,
        paused: !!options.paused,
        fade: !!options.fade,
        fadeOutMs: Math.round(this.fadeTime * 1000),
        volume: this.volume,
        gain: this.replayGainFactor()
      })
    } catch (err) {
      console.warn('[Exo] load failed', err)
      if (token === this.changeToken) this.onerror(err)
      return
    }

    // After 15 s (or half the track), pre-buffer the next track
    setTimeout(async () => {
      if (token === this.changeToken && nextUrl) {
        await this.setBuffer(nextUrl)
        console.info('exo.setBuffer:', nextUrl)
      }
    }, Math.min(15000, (this.duration() || 30) * 0.5 * 1000))
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Linear gain multiplier for the current ReplayGain mode, respecting the
   * per-track / per-album peak so we never clip. Identical to audio.ts.
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
      return 1
    }

    const preAmp = 6 // dB
    return Math.min(
      Math.pow(10, (gain + preAmp) / 20),
      1 / peak
    )
  }
}
