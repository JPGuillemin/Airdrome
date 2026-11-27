// player/exo.js
//
// Native Android audio engine backed by Media3 ExoPlayer (see
// ExoPlayerPlugin.java). It exposes the same public surface as
// AudioController in audio.js, so store.js/lifecycle.js do not need
// platform-specific branches for normal playback.
//
// Kept features from the Web Audio engine:
//   - fade in/out on play, pause, seek and track changes
//   - ReplayGain track/album gain (with the +6 dB preamp and peak clamp)
//   - next-track preloading
//   - offline cache integration (local file:// URI when available)
//
// Native-only extras:
//   - the queue window pushed to ExoPlayer, so it can start the next track
//     while the WebView is frozen; JS only follows with 'trackChanged'
//   - native media-session metadata/state and audio focus/route handling

import { registerPlugin } from '@capacitor/core'
import { useCacheStore } from '@/shared/cache'
import { nativeMediaSession } from '@/player/nativeMediaSession'
import { ReplayGainMode, replayGainFactor } from '@/player/audioShared'

var Exo = registerPlugin('ExoPlayer')

function warn(error) {
  console.warn('[Exo]', error)
}

/**
 * True for a native file URI that ExoPlayer can open directly.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isLocalUri(url) {
  return !!url && (url.indexOf('file:') === 0 || url.indexOf('content:') === 0)
}

/**
 * Decide whether a track that just stopped was listened to enough to cache it.
 *
 * @param {string} previousKey
 * @param {string} currentKey
 * @param {number} position
 * @param {number} duration
 * @returns {boolean}
 */
function shouldCachePrevious(previousKey, currentKey, position, duration) {
  if (!previousKey || previousKey === currentKey) {
    return false
  }

  if (position > 5) {
    return true
  }

  return duration > 0 && position > duration * 0.5
}

// ---------------------------------------------------------------------------
// ExoController
// ---------------------------------------------------------------------------

/**
 * Create the native ExoPlayer controller.
 *
 * @constructor
 */
export function ExoController() {
  /** Fade duration in seconds, same as the Web Audio engine. */
  this.fadeTime = 0.3

  /** Bumped on every loadTrack() so stale async loads can abort. */
  this.changeToken = 0

  this.replayGainMode = ReplayGainMode.None
  this.replayGain = null
  this.volume = 1

  this._position = 0
  this._duration = 0

  /** Pending seek target: stale native position events are dropped until reached. */
  this.seekTarget = null
  this.seekAt = 0

  /** Original URL and the URI actually handed to ExoPlayer. */
  this.currentKey = ''
  this.currentPlayable = ''
  this.playing = false

  /** Next-track preload state. */
  this.nextUrl = undefined
  this.preloadReady = false
  this.preloadedFor = undefined

  /**
   * A seek requested on a remote stream that ExoPlayer may not be able to
   * seek. Resolved by switching to the cached local file as soon as it exists.
   */
  this.pending = null
  this.pollTimer = null

  /** ReplayGain data of the tracks last pushed with setWindow(), by key. */
  this.windowGains = new Map()

  // Callbacks assigned by lifecycle.js.
  this.ontimeupdate = function() {}
  this.ondurationchange = function() {}
  this.onpause = function() {}
  this.onplay = function() {}
  this.onended = function() {}
  this.onerror = function() {}
  this.onplaying = function() {}
  this.onwaiting = function() {}
  this.onseeked = function() {}

  /** Native started another track by itself: follow without reloading. */
  this.ontrackchanged = function() {}

  var self = this

  Exo.addListener('play', function() {
    self.playing = true
    if (self.pending && !self.pending.since) self.pending.since = Date.now()
    self.onplay()
  }).catch(warn)

  Exo.addListener('pause', function() {
    if (self.pending && self.pending.since) {
      self.pending.played += Date.now() - self.pending.since
      self.pending.since = 0
    }
    self.playing = false
    self.onpause()
  }).catch(warn)

  Exo.addListener('playing', function() {
    self.playing = true
    if (self.pending && !self.pending.since) self.pending.since = Date.now()
    self.onplaying()
  }).catch(warn)

  Exo.addListener('waiting', function() {
    if (self.pending && self.pending.since) {
      self.pending.played += Date.now() - self.pending.since
      self.pending.since = 0
    }
    self.playing = false
    self.onwaiting()
  }).catch(warn)

  Exo.addListener('ended', function() {
    var token = self.changeToken
    self.onended()

    // No next track was loaded: report the pause after the store had a chance
    // to react (end of queue, radio extension...).
    setTimeout(function() {
      if (token === self.changeToken && self.playing) {
        self.playing = false
        self.onpause()
      }
    }, 800)
  }).catch(warn)

  Exo.addListener('trackChanged', function(event) {
    var previousKey = self.currentKey
    var previousPosition = self._position
    var previousDuration = self._duration

    self.currentKey = event.key
    self.currentPlayable = event.url
    self.replayGain = self.windowGains.get(event.key) || null
    self._position = 0
    self._duration = event.duration > 0 ? event.duration : 0
    self.seekTarget = null
    self.pending = null
    self.stopPoll()
    self.ontrackchanged(event.index)

    // Cache a track after leaving it, not while it is streaming: a second
    // download during playback breaks servers with low concurrent-stream limits.
    if (shouldCachePrevious(previousKey, event.key, previousPosition, previousDuration)) {
      useCacheStore().cacheTrack(previousKey)
    }
  }).catch(warn)

  Exo.addListener('time', function(event) {
    self.handleTime(event)
  }).catch(warn)

  Exo.addListener('debug', function(event) {
    console.info('[Exo] ' + event.message)
  }).catch(warn)

  Exo.addListener('duration', function(event) {
    if (isFinite(event.duration) && event.duration > 0) {
      self._duration = event.duration
      self.ondurationchange(event.duration)
    }
  }).catch(warn)

  Exo.addListener('error', function(event) {
    console.warn('[Exo] playback error', event)

    // A transcoded stream can end a few seconds before its announced length.
    // Treat that as a normal end of track instead of an error.
    var nearEnd = self._duration > 0 && self._duration - self._position < 5

    if (nearEnd && self.playing) {
      var token = self.changeToken
      self.onended()

      setTimeout(function() {
        if (token === self.changeToken && self.playing) {
          self.playing = false
          self.onpause()
        }
      }, 800)
      return
    }

    self.onerror(event)
  }).catch(warn)

  // The cache store dispatches this once a track is fully written to disk.
  window.addEventListener('audioCached', function(event) {
    self.onCached(event.detail).catch(warn)
  })
}

// ---------------------------------------------------------------------------
// Public accessors
// ---------------------------------------------------------------------------

/** There is no HTMLAudioElement in native mode. */
ExoController.prototype.currentTime = function() {
  return this._position
}

/** @returns {number} */
ExoController.prototype.duration = function() {
  return this._duration
}

/**
 * Current native player status. Used when the WebView resumes after being
 * suspended and the native player may have moved on.
 *
 * @returns {Promise<Object>}
 */
ExoController.prototype.getStatus = function() {
  return Exo.getStatus()
}

// ---------------------------------------------------------------------------
// Caching / buffering
// ---------------------------------------------------------------------------

/**
 * Remember/preload the next track.
 *
 * @param {string} [url]
 * @returns {Promise<void>}
 */
ExoController.prototype.setNextUrl = async function(url) {
  this.nextUrl = url

  if (!this.preloadReady) {
    return
  }

  if (!url) {
    this.discardPreload()
    return
  }

  try {
    await this.preloadNext()
  } catch (error) {
    // Preloading is best-effort.
  }
}

/**
 * Preload `nextUrl`: download it to the offline cache when it is not there
 * yet (like the Web engine's second <audio> element does), then hand the
 * local file to the native buffer player.
 *
 * @returns {Promise<void>}
 */
ExoController.prototype.preloadNext = async function() {
  var url = this.nextUrl

  if (!url || this.preloadedFor === url) {
    return
  }

  var token = this.changeToken
  var cachedUrl = await useCacheStore().peekCachedUrl(url, true)

  if (token !== this.changeToken || this.nextUrl !== url) {
    return
  }

  // Mark in-flight immediately so concurrent calls for the same URL stop.
  this.preloadedFor = url

  if (!isLocalUri(cachedUrl)) {
    // Not in the offline cache yet: pre-download it in the background while
    // the current track plays — the same extra connection the Web engine
    // opens with its preload <audio> element. The store's queue keeps this
    // to one download at a time. When the file lands, the audioCached
    // listener re-pushes the native window with the local file:// URI and
    // ExoPlayer pre-builds the next track from disk, so the change starts
    // instantly instead of cold from the network.
    useCacheStore().cacheTrack(url).catch(warn)
    return
  }

  try {
    await Exo.preload({ url: cachedUrl, key: url })
    console.info('exo.preload:', cachedUrl)
  } catch (error) {
    this.preloadedFor = undefined
    warn(error)
  }
}

/**
 * Drop the preloaded next track.
 *
 * @param {boolean} [resetUrl]
 * @returns {void}
 */
ExoController.prototype.discardPreload = function(resetUrl) {
  this.preloadedFor = undefined

  if (resetUrl !== false) {
    this.nextUrl = undefined
  }

  Exo.clearPreload().catch(function() {
    // Buffer may already be gone.
  })
}

// ---------------------------------------------------------------------------
// Volume and ReplayGain
// ---------------------------------------------------------------------------

/**
 * Set master volume (0-1).
 *
 * @param {number} value
 * @returns {void}
 */
ExoController.prototype.setVolume = function(value) {
  this.volume = value
  Exo.setLevels({ volume: value }).catch(warn)
}

/**
 * Switch ReplayGain mode and push the new linear gain to the player.
 *
 * @param {number} value
 * @returns {void}
 */
ExoController.prototype.setReplayGainMode = function(value) {
  this.replayGainMode = value
  Exo.setLevels({ gain: replayGainFactor(this.replayGainMode, this.replayGain) }).catch(warn)
}

// ---------------------------------------------------------------------------
// Playback control
// ---------------------------------------------------------------------------

/**
 * Stop playback and release the native players.
 *
 * @returns {Promise<void>}
 */
ExoController.prototype.stop = async function() {
  this.changeToken += 1
  this.preloadReady = false
  this.nextUrl = undefined
  this.preloadedFor = undefined
  this.pending = null
  this.stopPoll()

  await Exo.stop()

  try {
    await nativeMediaSession.abandonAudioFocus()
  } catch (error) {
    warn(error)
  }

  console.info('audio.stop()')
}

/**
 * Fade out, then pause.
 *
 * @returns {Promise<void>}
 */
ExoController.prototype.pause = async function() {
  await Exo.pause({ fadeOutMs: Math.round(this.fadeTime * 1000) })
  console.info('audio.pause()')
}

/**
 * Play, then fade in.
 *
 * @returns {Promise<void>}
 */
ExoController.prototype.play = async function() {
  try {
    await nativeMediaSession.requestAudioFocus()
  } catch (error) {
    warn(error)
  }

  await Exo.play({ fadeInMs: Math.round((this.fadeTime / 2) * 1000) })
  console.info('audio.play()')
}

/** No AudioContext to resume in native mode. */
ExoController.prototype.resume = async function() {}

/**
 * Seek to an absolute position in seconds.
 *
 * @param {number} value
 * @returns {Promise<void>}
 */
ExoController.prototype.seek = async function(value) {
  this._position = value
  this.seekTarget = value
  this.seekAt = Date.now()
  this.ontimeupdate(value)

  this.pending = null
  this.stopPoll()

  var remote = !!this.currentKey && !isLocalUri(this.currentPlayable)

  if (remote) {
    var token = this.changeToken

    if (await this.switchToLocal(value)) {
      return
    }

    if (token !== this.changeToken) {
      return
    }

    // Remote stream not cached yet: remember the seek and apply it when the
    // cache store finishes downloading the track. Only actual playing time is
    // counted, so a pause (phone call, Bluetooth disconnect...) or a delayed
    // play never moves the switch-to-local position forward.
    this.pending = {
      key: this.currentKey,
      position: value,
      played: 0,
      since: this.playing ? Date.now() : 0,
      at: Date.now()
    }
    useCacheStore().cacheTrack(this.currentKey)

    var self = this
    var key = this.currentKey

    this.pollTimer = setInterval(async function() {
      if (!self.pending || self.pending.key !== key || Date.now() - self.pending.at > 120000) {
        self.stopPoll()
        return
      }

      if (await useCacheStore().hasTrack(key)) {
        self.onCached(key)
      }
    }, 1000)
  }

  await Exo.seek({
    position: value,
    fadeMs: Math.round((this.fadeTime / 2) * 1000)
  })
}

/** @returns {void} */
ExoController.prototype.stopPoll = function() {
  if (this.pollTimer) {
    clearInterval(this.pollTimer)
  }

  this.pollTimer = null
}

/**
 * Playback position while a seek is being resolved on a remote stream.
 * Counts only actual playing time, never paused or pre-play time.
 *
 * @returns {number}
 */
ExoController.prototype.pendingPosition = function() {
  var pending = this.pending

  if (!pending) {
    return 0
  }

  var played = pending.played

  if (pending.since) {
    played += Date.now() - pending.since
  }

  return pending.position + played / 1000
}

/**
 * Reload the current track from its cached local file at `position` seconds.
 *
 * @param {number} position
 * @returns {Promise<boolean>}
 */
ExoController.prototype.switchToLocal = async function(position) {
  var token = this.changeToken
  var local = await useCacheStore().getCachedUrl(this.currentKey, true)

  if (token !== this.changeToken || !isLocalUri(local)) {
    return false
  }

  this.currentPlayable = local

  try {
    await Exo.load({
      url: local,
      key: this.currentKey,
      paused: !this.playing,
      fade: false,
      fadeOutMs: 0,
      volume: this.volume,
      gain: replayGainFactor(this.replayGainMode, this.replayGain),
      startPosition: position
    })
  } catch (error) {
    warn(error)
  }

  return true
}

/**
 * Called when the cache store finished writing `url` to disk.
 *
 * @param {string} url
 * @returns {Promise<void>}
 */
ExoController.prototype.onCached = async function(url) {
  var pending = this.pending

  if (!pending || url !== pending.key || pending.key !== this.currentKey) {
    return
  }

  var position = this.pendingPosition()

  this.pending = null
  this.stopPoll()

  this.seekTarget = position
  this.seekAt = Date.now()

  await this.switchToLocal(position)
}

// ---------------------------------------------------------------------------
// Track loading
// ---------------------------------------------------------------------------

/**
 * Load a new track into the native player.
 *
 * @param {Object} options
 * @param {string} [options.url]
 * @param {string} [options.nextUrl]
 * @param {boolean} [options.paused]
 * @param {Object} [options.replayGain]
 * @param {boolean} [options.fade]
 * @returns {Promise<void>}
 */
ExoController.prototype.loadTrack = async function(options) {
  if (!options.url) {
    return
  }

  var self = this
  var currentUrl = options.url
  var nextUrl = options.nextUrl
  var cacheStore = useCacheStore()
  var token = this.changeToken + 1
  var previousKey = this.currentKey
  var previousPosition = this._position
  var previousDuration = this._duration

  // Tell native a JS load is in flight before we resolve the cache URL. This
  // stops ExoPlayer from auto-advancing the old track while we are loading.
  Exo.beginLoad().catch(warn)

  this.changeToken = token
  this.replayGain = options.replayGain != null ? options.replayGain : null
  this._position = 0
  this._duration = 0
  this.seekTarget = null
  this.pending = null
  this.stopPoll()

  this.nextUrl = nextUrl
  this.preloadReady = false
  this.preloadedFor = undefined

  // Cache the track being played, exactly like the Web engine does
  // (getCachedUrl): it is queued before the next-track preload, so the
  // currently playing track is written to disk (and marked cached) first.
  // The cache queue downloads sequentially, so this stays one extra
  // connection alongside playback, not one per track.
  var playable = await cacheStore.getCachedUrl(currentUrl, true)

  if (token !== this.changeToken) {
    return
  }

  this.currentKey = currentUrl
  this.currentPlayable = playable

  if (!options.paused) {
    nativeMediaSession.requestAudioFocus().catch(warn)
  }

  try {
    await Exo.load({
      url: playable,
      key: currentUrl,
      paused: !!options.paused,
      fade: !!options.fade,
      fadeOutMs: Math.round(this.fadeTime * 1000),
      volume: this.volume,
      gain: replayGainFactor(this.replayGainMode, this.replayGain)
    })
  } catch (error) {
    console.warn('[Exo] load failed', error)

    if (token === this.changeToken) {
      this.onerror(error)
    }

    return
  }

  console.info('exo.load:', playable)

  // The track we just left has been listened to: cache it now, while the new
  // track is the only active playback stream.
  if (shouldCachePrevious(previousKey, currentUrl, previousPosition, previousDuration)) {
    cacheStore.cacheTrack(previousKey)
  }

  setTimeout(async function() {
    if (token !== self.changeToken) {
      return
    }

    self.preloadReady = true

    try {
      await self.preloadNext()
    } catch (error) {
      // best-effort
    }
  }, Math.min(15000, (self.duration() || 30) * 0.5 * 1000))
}

// ---------------------------------------------------------------------------
// Queue window (native auto-advance)
// ---------------------------------------------------------------------------

/**
 * Describe the queue around the current track to the native player.
 *
 * @param {Array<Object>} tracks
 * @param {number} current
 * @returns {Promise<void>}
 */
ExoController.prototype.setWindow = async function(tracks, current) {
  var self = this
  var cacheStore = useCacheStore()

  this.windowGains = new Map()

  for (var i = 0; i < tracks.length; i++) {
    this.windowGains.set(tracks[i].url, tracks[i].replayGain || null)
  }

  var resolved = await Promise.all(tracks.map(async function(track) {
    var url = track.url

    try {
      url = await cacheStore.peekCachedUrl(track.url, true)
    } catch (error) {
      // A cache lookup failure must not leave the native window empty.
      warn(error)
    }

    return {
      index: track.index,
      key: track.url,
      url: url,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artworkUrl: track.artworkUrl,
      duration: track.duration,
      gain: replayGainFactor(self.replayGainMode, track.replayGain)
    }
  }))

  var currentIndex = -1

  for (var j = 0; j < resolved.length; j++) {
    if (resolved[j].index === current) {
      currentIndex = j
      break
    }
  }

  await Exo.setWindow({
    tracks: resolved,
    current: currentIndex
  })
}

// ---------------------------------------------------------------------------
// Time / seek events
// ---------------------------------------------------------------------------

/**
 * Handle a native `time` event.
 *
 * @param {Object} event
 * @returns {void}
 */
ExoController.prototype.handleTime = function(event) {
  var position = event.position
  var duration = event.duration

  if (this.pending && this.pending.key === this.currentKey) {
    var estimate = this.pendingPosition()

    if (Math.abs(position - estimate) < 1.5) {
      this.pending = null
      this.seekTarget = null
    } else if (Date.now() - this.pending.at < 60000) {
      this.ontimeupdate(estimate)
      return
    } else {
      this.pending = null
    }
  }

  if (this.seekTarget !== null) {
    var reached = Math.abs(position - this.seekTarget) < 1.5

    if (!reached && Date.now() - this.seekAt < 3000) {
      return
    }

    this.seekTarget = null
    this.onseeked(position)
  }

  this._position = position

  if (isFinite(duration) && duration > 0) {
    this._duration = duration
  }

  this.ontimeupdate(position)
}

// ---------------------------------------------------------------------------
// ReplayGain
// ---------------------------------------------------------------------------

