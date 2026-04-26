import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

export type NativePlaybackState = 'playing' | 'paused' | 'stopped' | 'none'

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

export type NativeMediaSessionEvent =
  | 'play' | 'pause' | 'next' | 'previous' | 'stop' | 'seek'

interface MediaSessionPluginShape {
  setMetadata(options: NativeMetadataOptions): Promise<void>
  setPlaybackState(options: NativePlaybackStateOptions): Promise<void>
  addListener(
    event: NativeMediaSessionEvent,
    handler: (data: any) => void
  ): Promise<PluginListenerHandle>
}

const noop: MediaSessionPluginShape = {
  async setMetadata() {},
  async setPlaybackState() {},
  async addListener() {
    return { remove: async () => {} } as PluginListenerHandle
  }
}

export const isNativeMediaSession = Capacitor.getPlatform() === 'android'

export const nativeMediaSession: MediaSessionPluginShape = isNativeMediaSession
  ? registerPlugin<MediaSessionPluginShape>('MediaSession')
  : noop
