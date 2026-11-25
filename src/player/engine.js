// player/engine.js
//
// Picks the audio backend at startup:
//   - Android/Capacitor: ExoController -> Media3 ExoPlayer native plugin
//   - Browser/PWA:       AudioController -> Web Audio + HTMLAudioElement
//
// Both expose the same public surface, so the player store and setupAudio()
// stay platform-agnostic.

import { Capacitor } from '@capacitor/core'
import { isAndroid } from '@/shared/platform'
import { audio as webAudio } from '@/player/audio'
import { ExoController } from '@/player/exo'
import { ReplayGainMode, storedReplayGainMode } from '@/player/replayGain'

/** Active audio engine for this platform. */
export var audio = isAndroid ? new ExoController() : webAudio

console.info('[engine] platform=' + Capacitor.getPlatform() +
  ' androidBridge=' + (typeof window !== 'undefined' && !!window.androidBridge) +
  ' isAndroid=' + isAndroid +
  ' engine=' + (isAndroid ? 'ExoPlayer' : 'WebAudio'))

export { ReplayGainMode, storedReplayGainMode, isAndroid }
