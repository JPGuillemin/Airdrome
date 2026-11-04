// audio.js
//
// Owns the Web Audio pipeline and the HTMLAudioElement used for playback.
// Written in an explicit, ES5-friendly style: constructor functions,
// prototype methods, function expressions and async/await.

import { sleep } from '@/shared/utils'
import { useCacheStore } from '@/shared/cache'

// ---------------------------------------------------------------------------
// ReplayGain
// ---------------------------------------------------------------------------

/**
 * ReplayGain modes.
 *
 * @readonly
 * @enum {number}
 */
export var ReplayGainMode = {
  None: 0,
  Track: 1,
  Album: 2,
  _Length: 3
}

/**
 * @typedef {Object} ReplayGain
 * @property {number} trackGain
 * @property {number} trackPeak
 * @property {number} albumGain
 * @property {number} albumPeak
 */

/**
 * @typedef {Object} AudioPipeline
 * @property {HTMLAudioElement} audio
 * @property {GainNode} volumeNode
 * @property {GainNode} replayGainNode
 * @property {GainNode} fadeNode
 * @property {DynamicsCompressorNode} normalizerNode
 * @property {Function} dispose
 */

// ---------------------------------------------------------------------------
// AudioController
// ---------------------------------------------------------------------------

/**
 * Create the audio controller.
 *
 * @constructor
 */
export function AudioController() {
  /** Duration of the cross-fade / fade-in-out in seconds. */
  this.fadeTime = 0.3

  /**
   * Bumped on every loadTrack() call. Async work captures this value and
   * aborts when it no longer matches, which prevents race conditions when
   * tracks change quickly.
   */
  this.changeToken = 0

  /** Pre-loaded HTMLAudioElement for the next track. */
  this.buffer = null

  /** URL of the track that should be pre-buffered next. */
  this.nextUrl = undefined

  /** True once the pre-buffer delay has elapsed for the current track. */
  this.preloadReady = false

  /** Original URL currently held in this.buffer as the next track. */
  this.preloadedFor = undefined

  /** Original URL the current buffer was created for. */
  this.bufferedFor = undefined

  this.replayGainMode = ReplayGainMode.None
  this.replayGain = null
  this._context = null
  this.pipeline = null

  // Callbacks assigned by the player store.
  this.ontimeupdate = function() {}
  this.ondurationchange = function() {}
  this.onpause = function() {}
  this.onplay = function() {}
  this.onended = function() {}
  this.onerror = function() {}
  this.onplaying = function() {}
  this.onwaiting = function() {}
}

// ---------------------------------------------------------------------------
// Public accessors
// ---------------------------------------------------------------------------

/**
 * Return the audio element of the active pipeline.
 *
 * @returns {HTMLAudioElement}
 */
AudioController.prototype.getAudioElement = function() {
  return this.getActivePipeline().audio
}

/**
 * Return the current playback position in seconds.
 *
 * @returns {number}
 */
AudioController.prototype.currentTime = function() {
  return this.getActivePipeline().audio.currentTime
}

/**
 * Return the current track duration in seconds.
 *
 * @returns {number}
 */
AudioController.prototype.duration = function() {
  return this.getActivePipeline().audio.duration
}

// ---------------------------------------------------------------------------
// Caching / buffering
// ---------------------------------------------------------------------------

/**
 * Ask the cache store to persist a track URL.
 *
 * @param {string} url
 * @returns {void}
 */
AudioController.prototype.cacheTrack = function(url) {
  var cacheStore = useCacheStore()
  cacheStore.cacheTrack(url)
}

/**
 * Create and preload an audio element for a URL.
 *
 * @param {string} url - URL to load (may be a Blob URL).
 * @param {string} [forUrl] - Original URL this buffer represents.
 * @returns {void}
 */
AudioController.prototype.setBuffer = function(url, forUrl) {
  this.buffer = new Audio()
  this.buffer.crossOrigin = 'anonymous'
  this.buffer.preload = 'auto'
  this.buffer.src = url
  this.bufferedFor = forUrl || url

  try {
    this.buffer.load()
  } catch (error) {
    // Ignore load errors; the element will report them through onerror.
  }
}

/**
 * Update the track that should be pre-buffered for gapless playback.
 *
 * @param {string} [url]
 * @returns {void}
 */
AudioController.prototype.setNextUrl = async function(url) {
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
    // Preloading is best-effort; playback falls back to the network.
  }
}

/**
 * Preload this.nextUrl.
 *
 * @returns {Promise<void>}
 */
AudioController.prototype.preloadNext = async function() {
  var url = this.nextUrl

  if (!url || this.preloadedFor === url) {
    return
  }

  var token = this.changeToken
  // Mark as in-flight immediately so concurrent calls for the same URL stop.
  this.preloadedFor = url

  var cachedUrl = await useCacheStore().getCachedUrl(url)

  if (token !== this.changeToken || this.nextUrl !== url) {
    if (this.preloadedFor === url) {
      this.preloadedFor = undefined
    }
    return
  }

  this.discardPreload(false)
  this.setBuffer(cachedUrl, url)
  this.preloadedFor = url
  console.info('audio.setBuffer(2):', cachedUrl)
}

/**
 * Drop the preloaded next track.
 *
 * @param {boolean} [resetUrl]
 * @returns {void}
 */
AudioController.prototype.discardPreload = function(resetUrl) {
  var buffer = this.buffer

  if (buffer && buffer !== (this.pipeline && this.pipeline.audio)) {
    buffer.src = ''
    try {
      buffer.load()
    } catch (error) {
      // Ignore cleanup errors.
    }
  }

  this.buffer = null
  this.bufferedFor = undefined

  if (resetUrl !== false) {
    this.preloadedFor = undefined
  }
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
AudioController.prototype.setVolume = function(value) {
  this.getActivePipeline().volumeNode.gain.value = value
}

/**
 * Switch ReplayGain mode.
 *
 * @param {number} value
 * @returns {void}
 */
AudioController.prototype.setReplayGainMode = function(value) {
  this.replayGainMode = value
  this.getActivePipeline().replayGainNode.gain.value = this.replayGainFactor()

  var normalizer = this.getActivePipeline().normalizerNode

  if (value === ReplayGainMode.None) {
    normalizer.threshold.value = 0
    normalizer.knee.value = 0
    normalizer.ratio.value = 1
  } else {
    normalizer.threshold.value = -3
    normalizer.knee.value = 3
    normalizer.ratio.value = 2
    normalizer.attack.value = 0.01
    normalizer.release.value = 0.1
  }
}

// ---------------------------------------------------------------------------
// Playback control
// ---------------------------------------------------------------------------

/**
 * Stop playback and tear down the pipeline.
 *
 * @returns {Promise<void>}
 */
AudioController.prototype.stop = async function() {
  await this.pause()

  this.changeToken += 1
  this.preloadReady = false
  this.nextUrl = undefined
  this.preloadedFor = undefined
  this.discardPreload()

  if (this.pipeline) {
    this.disposePipeline(this.pipeline)
    this.pipeline = null
  }

  console.info('audio.stop()')
}

/**
 * Fade out and pause the audio element.
 *
 * @returns {Promise<void>}
 */
AudioController.prototype.pause = async function() {
  var audio = this.getActivePipeline().audio

  await this.fadeOut(this.fadeTime)
  audio.pause()
  console.info('audio.pause()')
}

/**
 * Resume the audio context and play.
 *
 * @returns {Promise<void>}
 */
AudioController.prototype.play = async function() {
  var context = this.getAudioContext()

  if (context.state !== 'running') {
    try {
      await context.resume()
    } catch (error) {
      // The context may refuse to resume until the next user gesture.
    }
  }

  await this.getActivePipeline().audio.play()
  await this.fadeIn(this.fadeTime / 2)
  console.info('audio.play()', context.state)
}

/**
 * Resume the audio context.
 *
 * @returns {Promise<void>}
 */
AudioController.prototype.resume = async function() {
  await this.getAudioContext().resume()
  console.info('audio.resume()')
}

/**
 * Seek to an absolute position in seconds.
 *
 * @param {number} value
 * @returns {Promise<void>}
 */
AudioController.prototype.seek = async function(value) {
  var token = this.changeToken
  var pipeline = this.getActivePipeline()

  if (!pipeline.audio.paused) {
    this.fadeOut(this.fadeTime / 2)
  }

  pipeline.audio.currentTime = value

  if (token !== this.changeToken) {
    return
  }

  if (!pipeline.audio.paused) {
    this.fadeIn(this.fadeTime / 2)
  }
}

// ---------------------------------------------------------------------------
// Track loading
// ---------------------------------------------------------------------------

/**
 * Load a new track into the pipeline.
 *
 * @param {Object} options
 * @param {string} [options.url]
 * @param {string} [options.nextUrl]
 * @param {boolean} [options.paused]
 * @param {ReplayGain} [options.replayGain]
 * @param {boolean} [options.fade]
 * @returns {Promise<void>}
 */
AudioController.prototype.loadTrack = async function(options) {
  if (!options.url) {
    return
  }

  var self = this
  var currentUrl = options.url
  var cacheStore = useCacheStore()
  var token = this.changeToken + 1

  this.changeToken = token

  if (options.replayGain != null) {
    this.replayGain = options.replayGain
  } else {
    this.replayGain = null
  }

  // New track: reset preload state and remember the target next URL.
  this.nextUrl = options.nextUrl
  this.preloadReady = false
  this.preloadedFor = undefined

  var needsBuffer = !this.buffer || this.bufferedFor !== currentUrl || this.buffer.error
  var cachedUrl

  if (needsBuffer) {
    cachedUrl = await cacheStore.getCachedUrl(currentUrl)
  } else {
    // Keep the microtask boundary the previous promise chain had.
    await Promise.resolve()
  }

  if (needsBuffer) {
    this.setBuffer(cachedUrl, currentUrl)
    console.info('audio.setBuffer(1):', cachedUrl)
  }

  var volume = 1

  if (this.pipeline) {
    volume = this.pipeline.volumeNode.gain.value
  }
  var nextPipeline = createPipeline(this.getAudioContext(), {
    audio: this.buffer,
    volume: volume,
    replayGain: this.replayGainFactor()
  })

  // Abort if another loadTrack() started while we were awaiting the cache.
  if (token !== this.changeToken) {
    nextPipeline.dispose()
    return
  }

  if (options.fade) {
    await this.fadeOut(this.fadeTime)
  }

  this.replacePipeline(nextPipeline)
  this.setReplayGainMode(this.replayGainMode)

  var audio = this.getActivePipeline().audio

  audio.onerror = function(event) {
    self.onerror(event)
  }
  audio.onended = function() {
    self.onended()
  }
  audio.onpause = function() {
    self.onpause()
  }
  audio.onplay = function() {
    self.onplay()
  }
  audio.onplaying = function() {
    self.onplaying()
  }
  audio.onwaiting = function() {
    self.onwaiting()
  }
  audio.ontimeupdate = function() {
    self.ontimeupdate(audio.currentTime)
  }

  audio.addEventListener('loadedmetadata', function() {
    var duration = audio.duration
    if (isFinite(duration) && duration > 0) {
      self.ondurationchange(duration)
    }
  })

  try {
    audio.load()
  } catch (error) {
    // Ignore load errors; onerror handles real failures.
  }

  if (!options.paused) {
    try {
      await this.play()
    } catch (error) {
      if (error.name !== 'AbortError') {
        throw error
      }
    }
  }

  setTimeout(async function() {
    if (token !== self.changeToken) {
      return
    }

    self.preloadReady = true

    try {
      await self.preloadNext()
    } catch (error) {
      // Preloading is best-effort.
    }
  }, Math.min(15000, (self.getActivePipeline().audio.duration || 30) * 0.5 * 1000))
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Return the active pipeline, creating one when needed.
 *
 * @returns {AudioPipeline}
 */
AudioController.prototype.getActivePipeline = function() {
  if (!this.pipeline) {
    this.pipeline = createPipeline(this.getAudioContext(), {})
  }

  return this.pipeline
}

/**
 * Return the shared AudioContext, creating it on first use.
 *
 * @returns {AudioContext}
 */
AudioController.prototype.getAudioContext = function() {
  if (!this._context) {
    var context = new AudioContext()
    console.info('[ctx] created:', context.state)
    context.onstatechange = function() {
      console.info('[ctx] state ->', context.state)
    }
    this._context = context
  }

  return this._context
}

/**
 * Swap the active pipeline, disposing the previous one.
 *
 * @param {AudioPipeline} next
 * @returns {void}
 */
AudioController.prototype.replacePipeline = function(next) {
  if (this.pipeline) {
    this.disposePipeline(this.pipeline)
  }

  this.pipeline = next
}

/**
 * Remove handlers and schedule the pipeline for disposal.
 *
 * @param {AudioPipeline} pipeline
 * @returns {void}
 */
AudioController.prototype.disposePipeline = function(pipeline) {
  pipeline.audio.onended = null
  pipeline.audio.onerror = null
  pipeline.audio.onpause = null
  pipeline.audio.onplay = null
  pipeline.audio.ontimeupdate = null
  pipeline.audio.ondurationchange = null
  pipeline.audio.onplaying = null
  pipeline.audio.onwaiting = null

  setTimeout(function() {
    pipeline.dispose()
  }, 1000)
}

/**
 * Ramp the fade node to 1.
 *
 * @param {number} [duration]
 * @returns {Promise<void>}
 */
AudioController.prototype.fadeIn = function(duration) {
  var length = duration || 0
  var gain = this.getActivePipeline().fadeNode.gain
  var now = this.getAudioContext().currentTime

  gain.cancelScheduledValues(0)
  gain.setValueAtTime(gain.value, now)
  gain.linearRampToValueAtTime(1, now + length)

  return sleep(length * 1000)
}

/**
 * Ramp the fade node to 0.
 *
 * @param {number} [duration]
 * @returns {Promise<void>}
 */
AudioController.prototype.fadeOut = function(duration) {
  var length = duration || 0
  var gain = this.getActivePipeline().fadeNode.gain
  var now = this.getAudioContext().currentTime

  gain.cancelScheduledValues(0)
  gain.setValueAtTime(gain.value, now)
  gain.linearRampToValueAtTime(0, now + length)

  return sleep(length * 1000)
}

/**
 * Calculate the linear gain for the current ReplayGain mode.
 *
 * @returns {number}
 */
AudioController.prototype.replayGainFactor = function() {
  if (this.replayGainMode === ReplayGainMode.None || !this.replayGain) {
    return 1
  }

  var gain
  var peak

  if (this.replayGainMode === ReplayGainMode.Track) {
    gain = this.replayGain.trackGain
    peak = this.replayGain.trackPeak
  } else {
    gain = this.replayGain.albumGain
    peak = this.replayGain.albumPeak
  }

  if (!isFinite(gain) || !isFinite(peak) || peak <= 0) {
    return 1
  }

  var preAmp = 6
  return Math.min(Math.pow(10, (gain + preAmp) / 20), 1 / peak)
}

// ---------------------------------------------------------------------------
// Pipeline factory
// ---------------------------------------------------------------------------

/**
 * Create a fresh Web Audio pipeline.
 *
 * @param {AudioContext} context
 * @param {Object} [options]
 * @param {HTMLAudioElement} [options.audio]
 * @param {number} [options.volume]
 * @param {number} [options.replayGain]
 * @returns {AudioPipeline}
 */
function createPipeline(context, options) {
  var settings = options || {}
  var audio = settings.audio || new Audio()
  var volume = 1
  var replayGain = 1

  if (settings.volume != null) {
    volume = settings.volume
  }

  if (settings.replayGain != null) {
    replayGain = settings.replayGain
  }

  audio.playbackRate = 1

  var source = context.createMediaElementSource(audio)
  var volumeNode = context.createGain()
  var replayGainNode = context.createGain()
  var fadeNode = context.createGain()
  var normalizerNode = context.createDynamicsCompressor()

  volumeNode.gain.value = volume
  replayGainNode.gain.value = replayGain
  fadeNode.gain.value = 1
  normalizerNode.threshold.value = 0

  source
    .connect(volumeNode)
    .connect(replayGainNode)
    .connect(fadeNode)
    .connect(normalizerNode)
    .connect(context.destination)

  function dispose() {
    audio.pause()
    source.disconnect()
    volumeNode.disconnect()
    replayGainNode.disconnect()
    fadeNode.disconnect()
    normalizerNode.disconnect()
    audio.src = ''
    try {
      audio.load()
    } catch (error) {
      // Ignore cleanup errors.
    }
  }

  return {
    audio: audio,
    volumeNode: volumeNode,
    replayGainNode: replayGainNode,
    fadeNode: fadeNode,
    normalizerNode: normalizerNode,
    dispose: dispose
  }
}
