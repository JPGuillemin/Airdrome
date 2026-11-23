// player/engine.js
//
// Picks the audio backend at startup:
//   - Android/Capacitor: ExoController -> Media3 ExoPlayer native plugin
//   - Browser/PWA:       AudioController -> Web Audio + HTMLAudioElement
//
// Both expose the same public surface, so the player store and setupAudio()
// stay platform-agnostic.

import { isAndroid } from '@/shared/platform'
import {
  audio as webAudio,
  AudioController,
  ReplayGainMode,
  storedReplayGainMode
} from '@/player/audio'
import { ExoController } from '@/player/exo'

/** Active audio engine for this platform. */
export var audio = isAndroid ? new ExoController() : webAudio

export { AudioController, ReplayGainMode, storedReplayGainMode, isAndroid }
