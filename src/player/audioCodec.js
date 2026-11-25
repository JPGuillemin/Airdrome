// player/audioCodec.js
//
// Picks the stream format once per launch and stores it for the URL builder
// (shared/api/urls.js). Browsers/WebViews report which codecs they can decode.

/**
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
