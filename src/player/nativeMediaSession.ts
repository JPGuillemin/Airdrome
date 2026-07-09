// src/player/nativeMediaSession.ts
import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

export type NativePlaybackState = 'playing' | 'paused' | 'stopped' | 'none'
export type AudioRouteType = 'speaker' | 'bluetooth' | 'wired'

export interface AudioRouteChangeEvent {
  route: AudioRouteType
}

export interface NativeMetadataOptions {
  title?: string
  artist?: string
  album?: string
  artworkUrl?: string | null
  duration?: number
}

export interface NativePlaybackStateOptions {
  state: NativePlaybackState
  position?: number
  speed?: number
}

export type AudioFocusChangeType =
  | 'gain'
  | 'loss'
  | 'lossTransient'
  | 'lossDuck'

export interface AudioFocusChangeEvent {
  type: AudioFocusChangeType
}

export interface AudioFocusResult {
  /** True when focus was granted immediately. */
  granted: boolean
  /**
   * True when focus was not yet available (e.g. a phone call is active) but
   * the system has queued the request. AUDIOFOCUS_GAIN will fire via the
   * "audioFocusChange" listener once the occupier releases focus.
   * Only possible on API 26+ when setAcceptsDelayedFocusGain(true) is set.
   */
  delayed: boolean
}

export type NativeMediaSessionEvent =
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'stop'
  | 'seek'
  | 'seekto'
  | 'seekforward'
  | 'seekbackward'
  | 'audioFocusChange'
  | 'audioRouteChange'

interface MediaSessionPluginShape {
  setMetadata(options: NativeMetadataOptions): Promise<void>
  setPlaybackState(options: NativePlaybackStateOptions): Promise<void>
  requestAudioFocus(): Promise<AudioFocusResult>
  abandonAudioFocus(): Promise<void>
  addListener(
    event: NativeMediaSessionEvent,
    handler: (data: any) => void
  ): Promise<PluginListenerHandle>
}

const noop: MediaSessionPluginShape = {
  async setMetadata() {},
  async setPlaybackState() {},
  async requestAudioFocus() {
    return { granted: true, delayed: false }
  },
  async abandonAudioFocus() {},
  async addListener() {
    return { remove: async () => {} } as PluginListenerHandle
  }
}

const isNative =
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === 'android'

export const nativeMediaSession: MediaSessionPluginShape = isNative
  ? registerPlugin<MediaSessionPluginShape>('MediaSession')
  : noop
