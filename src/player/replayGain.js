// player/replayGain.js
//
// ReplayGain is shared by both audio engines: the Web Audio controller applies
// it to a GainNode, ExoPlayer receives it as a linear gain value. Keeping the
// maths here means the two backends can never drift apart.

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

  // +6 dB preamp, then clamp so the peak can never clip.
  var preAmp = 6
  return Math.min(Math.pow(10, (gain + preAmp) / 20), 1 / peak)
}

/** ReplayGain mode restored from localStorage, default None (0). */
export var storedReplayGainMode = parseInt(
  localStorage.getItem('player.replayGainMode') || '0',
  10
)
