// player/audioShared.js
//
// Small audio helpers shared by both engines (Web Audio and ExoPlayer):
//   - ReplayGain modes and the linear gain calculation
//   - stream codec detection used by the URL builder

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
 * Linear gain for a ReplayGain mode.
 *
 * @param {number} mode
 * @param {ReplayGain|null|undefined} replayGain
 * @returns {number}
 */
export function replayGainFactor(mode, replayGain) {
  if (mode === ReplayGainMode.None || !replayGain) {
    return 1
  }

  var gain
  var peak

  if (mode === ReplayGainMode.Track) {
    gain = replayGain.trackGain
    peak = replayGain.trackPeak
  } else {
    gain = replayGain.albumGain
    peak = replayGain.albumPeak
  }

  if (!isFinite(gain) || !isFinite(peak) || peak <= 0) {
    return 1
  }

  // +6 dB preamp so quiet tracks get a real boost. Deliberately no 1/peak
  // clamp: it made ReplayGain inaudible on tracks whose peak sits at full
  // scale (old, heavily limited masters). Peaks are limited by the engines
  // instead (Web Audio compressor / native PCM limiter).
  var preAmp = 6
  return Math.pow(10, (gain + preAmp) / 20)
}

/** ReplayGain mode restored from localStorage, default None (0). */
export var storedReplayGainMode = parseInt(
  localStorage.getItem('player.replayGainMode') || '0',
  10
)

/**
 * Pick the stream format once per launch and store it for the URL builder
 * (shared/api/urls.js). Browsers/WebViews report which codecs they decode.
 *
 * @returns {string} 'opus', 'aac' or 'mp3'.
 */
export function detectAudioCodec() {
  var probe = document.createElement('audio')
  var supported = {
    opus: probe.canPlayType('audio/ogg; codecs=opus') ||
      probe.canPlayType('audio/webm; codecs=opus'),
    aac: probe.canPlayType('audio/aac')
  }
  var preference = ['opus', 'aac']
  var codec = 'mp3'

  for (var i = 0; i < preference.length; i++) {
    if (supported[preference[i]]) {
      codec = preference[i]
      break
    }
  }

  console.info('Codec:', codec)
  localStorage.setItem('audioCodec', codec)
  return codec
}
