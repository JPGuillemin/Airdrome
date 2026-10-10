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
import { nativeMediaSession } from '@/player/nativeMediaSession'
import { ReplayGainMode, type AudioController } from '@/player/audio'

/** Public shape of AudioController (keyof only exposes public members). */
export type AudioEngine = Pick<AudioController, keyof AudioController>

export type ReplayGain = {
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
  /** Debug only: native Toast. */
  toast(o: { message: string }): Promise<void>
  /** Previous / current / next tracks, so native can advance without JS. */
  setWindow(o: { tracks: WindowTrack[]; current: number }): Promise<void>

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
    event: 'trackChanged',
    cb: (e: { index: number; key: string; url: string; duration: number }) => void
  ): Promise<PluginListenerHandle>
  addListener(
    event: 'error',
    cb: (e: { code?: number; message?: string }) => void
  ): Promise<PluginListenerHandle>
}

/** One queue entry described to the native player (see ExoPlayerPlugin.setWindow). */
type WindowTrack = {
  index: number       // position in the JS queue
  url: string         // playable URI (file:// or remote)
  key: string         // original remote URL
  title: string
  artist: string
  album: string
  artworkUrl: string | null
  duration: number    // seconds
  gain: number        // linear ReplayGain factor
}

const Exo = registerPlugin<ExoPlayerPlugin>('ExoPlayer')

const warn = (e: unknown) => console.warn('[Exo]', e)

/** Temporary on-screen diagnostics (native Toasts) – set to false once seeking is validated. */
const DEBUG = false
const dbg = (message: string) => {
  console.info('[Exo]', message)
  if (DEBUG) Exo.toast({ message }).catch(() => {})
}

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
  private pollTimer: ReturnType<typeof setInterval> | null = null
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
  /** Native started another track by itself (JS was asleep): follow, never reload. */
  ontrackchanged = (_index: number) => {}

  /** ReplayGain data of the tracks last pushed with setWindow(), by key. */
  private windowGains = new Map<string, ReplayGain | null>()

  constructor() {
    // Callbacks are looked up at call time, so the store can (re)assign them
    // after construction.
    Exo.addListener('play', () => { this.playing = true; this.onplay() }).catch(warn)
    Exo.addListener('pause', () => { this.playing = false; this.onpause() }).catch(warn)
    Exo.addListener('playing', () => this.onplaying()).catch(warn)
    Exo.addListener('waiting', () => this.onwaiting()).catch(warn)
    Exo.addListener('ended', () => {
      const token = this.changeToken
      this.onended() // the store normally loads the next track (bumps changeToken)
      // No next track was loaded: now report the pause (end of queue)
      setTimeout(() => {
        if (token === this.changeToken && this.playing) {
          this.playing = false
          this.onpause()
        }
      }, 800)
    }).catch(warn)

    // Native moved to the next / previous track on its own (end of track, lock
    // screen, headset...). Keep our bookkeeping in sync and let the store follow.
    // changeToken is NOT bumped: a loadTrack() the user started meanwhile must win
    // (native abandons superseded loads with its own loadGen).
    Exo.addListener('trackChanged', ({ index, key, url, duration }) => {
      this.currentKey = key
      this.currentPlayable = url
      this.replayGain = this.windowGains.get(key) ?? null
      this._position = 0
      this._duration = duration > 0 ? duration : 0
      this.seekTarget = null
      this.pending = null
      this.stopPoll()
      this.ontrackchanged(index)
    }).catch(warn)

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
      dbg(`error ${e?.message ?? ''} (${e?.code ?? '?'}) at ${Math.round(this._position)}/${Math.round(this._duration)}s`)
      // A stream that is cut a few seconds before its announced end (transcoded
      // streams with an estimated length) is a normal end of track, not an error.
      const nearEnd = this._duration > 0 && this._duration - this._position < 5
      if (nearEnd && this.playing) {
        const token = this.changeToken
        this.onended()
        setTimeout(() => {
          if (token === this.changeToken && this.playing) {
            this.playing = false
            this.onpause()
          }
        }, 800)
        return
      }
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

  /**
   * Describe the queue around the current track to the native player
   * (previous, current, next...). JS stays the source of truth; native only uses
   * this to start the next track when JS cannot answer in time.
   */
  async setWindow(
    tracks: {
      index: number
      url: string
      title: string
      artist: string
      album: string
      artworkUrl: string | null
      duration: number
      replayGain?: ReplayGain
    }[],
    current: number
  ) {
    const cacheStore = useCacheStore()
    this.windowGains = new Map(tracks.map(t => [t.url, t.replayGain ?? null]))
    const resolved: WindowTrack[] = await Promise.all(
      tracks.map(async t => ({
        index: t.index,
        key: t.url,
        url: await cacheStore.getCachedUrl(t.url, true), // same call as setBuffer()
        title: t.title,
        artist: t.artist,
        album: t.album,
        artworkUrl: t.artworkUrl,
        duration: t.duration,
        gain: this.gainFor(t.replayGain)
      }))
    )
    await Exo.setWindow({
      tracks: resolved,
      current: resolved.findIndex(t => t.index === current)
    })
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
    this.stopPoll()
    const remote = !!this.currentKey && !this.currentPlayable.startsWith('file:')
    dbg(`seek ${Math.round(value)}s (${remote ? 'remote' : 'local'})`)
    if (remote) {
      const token = this.changeToken
      if (await this.switchToLocal(value)) return
      if (token !== this.changeToken) return
      this.pending = { key: this.currentKey, position: value, at: Date.now() }
      dbg('not cached yet: waiting for download')
      void useCacheStore().cacheTrack(this.currentKey, true)
      // Safety net in case the 'audioCached' event is missed
      const key = this.currentKey
      this.pollTimer = setInterval(async () => {
        if (!this.pending || this.pending.key !== key || Date.now() - this.pending.at > 120000) {
          this.stopPoll()
          return
        }
        if (await useCacheStore().hasTrack(key)) void this.onCached(key)
      }, 1000)
    }
    await Exo.seek({ position: value, fadeMs: Math.round((this.fadeTime / 2) * 1000) })
  }

  private stopPoll() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
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
    this.stopPoll()
    dbg('cached: switching to local file')
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
    this.stopPoll()

    // file:// URI when cached, remote URL otherwise (also queues caching)
    const playable = await cacheStore.getCachedUrl(currentUrl, true)
    console.info('exo.load:', playable)
    this.currentKey = currentUrl
    this.currentPlayable = playable

    // Another loadTrack() started while we were resolving the URL
    if (token !== this.changeToken) return

    // ExoPlayer does not manage audio focus (handleAudioFocus=false) and the store
    // only requests it from play(): make sure we hold it whenever a track starts.
    if (!options.paused) nativeMediaSession.requestAudioFocus().catch(warn)

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
      if (token === this.changeToken && nextUrl) await this.setBuffer(nextUrl)
    }, Math.min(15000, (this.duration() || 30) * 0.5 * 1000))
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Linear gain multiplier for the current ReplayGain mode, respecting the
   * per-track / per-album peak so we never clip. Identical to audio.ts.
   */
  private replayGainFactor(): number {
    return this.gainFor(this.replayGain)
  }

  private gainFor(rg: ReplayGain | null | undefined): number {
    if (this.replayGainMode === ReplayGainMode.None || !rg) {
      return 1
    }

    const gain =
      this.replayGainMode === ReplayGainMode.Track ? rg.trackGain : rg.albumGain

    const peak =
      this.replayGainMode === ReplayGainMode.Track ? rg.trackPeak : rg.albumPeak

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
