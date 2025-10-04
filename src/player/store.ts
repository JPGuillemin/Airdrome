import { watch } from 'vue'
import { defineStore } from 'pinia'
import { shuffle, shuffled, trackListEquals, formatArtists, sleep } from '@/shared/utils'
import { API, Track } from '@/shared/api'
import { AudioController, ReplayGainMode } from '@/player/audio'
import { useMainStore } from '@/shared/store'

localStorage.removeItem('player.mute')
localStorage.removeItem('queue')
localStorage.removeItem('queueIndex')

const storedVolume = parseFloat(localStorage.getItem('player.volume') || '1.0')
const storedReplayGainMode = parseInt(localStorage.getItem('player.replayGainMode') ?? '0')
const mediaSession: MediaSession | undefined = navigator.mediaSession
const audio = new AudioController()

export const usePlayerStore = defineStore('player', {
  state: () => ({
    queue: [] as Track[],
    queueIndex: -1,
    isPlaying: false,
    duration: 0, // duration of current track in seconds
    currentTime: 0, // position of current track in seconds
    streamTitle: null as null | string,
    replayGainMode: storedReplayGainMode as ReplayGainMode,
    repeat: localStorage.getItem('player.repeat') !== 'false',
    shuffle: localStorage.getItem('player.shuffle') === 'true',
    volume: storedVolume,
    scrobbled: false,
    api: null as API | null,
  }),
  getters: {
    track(): Track | null {
      if (this.queue && this.queueIndex !== -1) {
        return this.queue[this.queueIndex]
      }
      return null
    },
    trackId(): string | null {
      return this.track?.id ?? null
    },
    progress(): number {
      if (this.currentTime > -1 && this.duration > 0) {
        return this.currentTime / this.duration
      }
      return 0
    },
    hasNext(): boolean {
      return !!this.queue && (this.queueIndex < this.queue.length - 1)
    },
    hasPrevious(): boolean {
      return this.queueIndex > 0
    },
  },
  actions: {
    async preloadNext() {
      if (this.queue && this.queue.length > 0) {
        const next = (this.queueIndex + 1) % this.queue.length
        const nextTrack = this.queue[next]
        if (nextTrack?.url) {
          audio.setBuffer(nextTrack.url)
        }
      }
    },
    async playNow(tracks: Track[]) {
      this.setShuffle(false)
      await this.playTrackList(tracks, 0)
    },
    async shuffleNow(tracks: Track[]) {
      this.setShuffle(true)
      await this.playTrackList(tracks)
    },
    async playTrackListIndex(index: number) {
      this.setQueueIndex(index)
      this.setPlaying()
      audio.changeTrack({ ...this.track })
      this.preloadNext()
    },
    async playTrackList(tracks: Track[], index?: number) {
      if (index == null) {
        index = this.shuffle ? Math.floor(Math.random() * tracks.length) : 0
      }
      if (this.shuffle) {
        tracks = [...tracks]
        shuffle(tracks, index)
        index = 0
      }
      if (!trackListEquals(this.queue || [], tracks)) {
        this.setQueue(tracks)
      }
      this.setQueueIndex(index)
      this.setPlaying()
      audio.changeTrack({ ...this.track })
      this.preloadNext()
    },
    async resume() {
      this.setPlaying()
      await audio.resume()
    },
    async play() {
      this.setPlaying()
      await audio.play()
    },
    async pause() {
      audio.pause()
      this.setPaused()
    },
    async playPause() {
      if (this.isPlaying) {
        return this.pause()
      } else {
        return this.resume()
      }
    },
    async next() {
      this.setQueueIndex(this.queueIndex + 1)
      this.setPlaying()
      audio.changeTrack({ ...this.track })
      this.preloadNext()
    },
    async previous() {
      this.setQueueIndex(audio.currentTime() > 3 ? this.queueIndex : this.queueIndex - 1)
      this.setPlaying()
      audio.changeTrack(this.track!)
      this.preloadNext()
    },
    async seek(value: number) {
      if (isFinite(this.duration)) {
        await audio.seek(this.duration * value)
      }
    },
    async loadQueue() {
      const { tracks, currentTrack, currentTrackPosition } = await this.api!.getPlayQueue()
      this.setQueue(tracks)
      this.setQueueIndex(currentTrack)
      this.setPaused()
      audio.changeTrack({ ...this.track, paused: true })
      this.preloadNext()
      await audio.seek(currentTrackPosition)
    },
    async resetQueue() {
      this.setQueueIndex(0)
      this.setPaused()
      audio.changeTrack({ ...this.track, paused: true })
    },
    async clearQueue() {
      if (!this.queue) {
        return
      }
      if (this.queue.length > 1) {
        this.setQueue([this.queue[this.queueIndex]])
        this.setQueueIndex(0)
      } else {
        this.setQueue([])
        this.setQueueIndex(-1)
        this.setPaused()
        audio.changeTrack({ })
      }
    },
    addToQueue(tracks: Track[]) {
      const lastTrack = this.queue && this.queue.length > 0 ? this.queue[this.queue.length - 1] : null
      if (tracks.length === 1 && tracks[0].id === lastTrack?.id) {
        return
      }
      this.queue?.push(...this.shuffle ? shuffled(tracks) : tracks)
    },
    setNextInQueue(tracks: Track[]) {
      const nextTrack = this.queue && this.queue.length > 0
        ? this.queue[(this.queueIndex + 1) % this.queue.length]
        : null
      if (tracks.length === 1 && tracks[0].id === nextTrack?.id) {
        return
      }
      this.queue?.splice(this.queueIndex + 1, 0, ...this.shuffle ? shuffled(tracks) : tracks)
    },
    removeFromQueue(index: number) {
      this.queue?.splice(index, 1)
      if (index < this.queueIndex) {
        this.queueIndex--
      }
    },
    shuffleQueue() {
      if (this.queue && this.queue.length > 0) {
        this.queue = shuffled(this.queue, this.queueIndex)
        this.queueIndex = 0
      }
    },
    toggleReplayGain() {
      const mode = (this.replayGainMode + 1) % ReplayGainMode._Length
      audio.setReplayGainMode(mode)
      this.replayGainMode = mode
      localStorage.setItem('player.replayGainMode', `${mode}`)
    },
    toggleRepeat() {
      this.repeat = !this.repeat
      localStorage.setItem('player.repeat', String(this.repeat))
    },
    toggleShuffle() {
      this.setShuffle(!this.shuffle)
    },
    setVolume(value: number) {
      audio.setVolume(value)
      this.volume = value
      localStorage.setItem('player.volume', String(value))
    },
    setShuffle(enable: boolean) {
      this.shuffle = enable
      localStorage.setItem('player.shuffle', String(enable))
    },
    setPlaying() {
      this.isPlaying = true
      setMediaSession({
        track: this.track,
        currentTime: this.currentTime,
        playbackRate: 1.0,
        isPlaying: this.isPlaying,
      })
      this.api!.savePlayQueue(this.queue!, this.track, 0)
    },
    setPaused() {
      this.isPlaying = false
      this.api!.savePlayQueue(this.queue!, this.track, 0)
      setMediaSession({
        track: this.track,
        currentTime: this.currentTime,
        playbackRate: 1.0,
        isPlaying: this.isPlaying,
      })
    },
    setQueue(queue: Track[]) {
      this.queue = queue
      this.queueIndex = -1
      this.api!.savePlayQueue(this.queue!, this.track, 0)
    },
    setQueueIndex(index: number) {
      if (!this.queue || this.queue.length === 0) {
        this.queueIndex = -1
        this.duration = 0
        if (mediaSession) {
          mediaSession.metadata = null
          mediaSession.playbackState = 'none'
        }
        return
      }
      index = Math.max(0, index)
      index = index < this.queue.length ? index : 0
      this.queueIndex = index
      this.scrobbled = false
      const track = this.queue[index]
      this.duration = track.duration
      if (mediaSession) {
        mediaSession.metadata = null
        setMediaSession({
          track: this.track,
          currentTime: 0,
          playbackRate: 1.0,
          isPlaying: this.isPlaying,
        })
      }
      this.api!.savePlayQueue(this.queue!, this.track, 0)
    },
  },
})

export function setMediaSession({
  track,
  currentTime = 0,
  playbackRate = 1.0,
  isPlaying = false,
}: {
  track: any | null
  currentTime?: number
  playbackRate?: number
  isPlaying?: boolean
}) {
  if (!('mediaSession' in navigator)) return
  const mediaSession = navigator.mediaSession
  if (!mediaSession) return

  const getImageMime = (url: string): string => {
    const ext = url.split('.').pop()?.toLowerCase() || ''
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg'
      case 'webp':
        return 'image/webp'
      case 'png':
        return 'image/png'
      case 'gif':
        return 'image/gif'
      default:
        return 'image/png'
    }
  }

  if (track) {
    const artwork =
      track.image
        ? [
            { src: track.image, sizes: '96x96', type: getImageMime(track.image) },
            { src: track.image, sizes: '256x256', type: getImageMime(track.image) },
            { src: track.image, sizes: '512x512', type: getImageMime(track.image) },
          ]
        : []

    mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Unknown Title',
      artist: (track.artists && formatArtists(track.artists)) || 'Unknown Artist',
      album: track.album || '',
      artwork,
    })
  }

  mediaSession.playbackState = isPlaying ? 'playing' : 'paused'

  if (typeof mediaSession.setPositionState === 'function' && track?.duration) {
    const duration = Math.max(0, track.duration)
    const position = Math.min(Math.max(0, currentTime || 0), duration)
    const rate = playbackRate > 0 ? playbackRate : 1.0

    try {
      mediaSession.setPositionState({
        duration,
        position,
        playbackRate: rate,
      })
    } catch (err) {
      console.warn('MediaSession.setPositionState failed:', err)
    }
  }
}

export function setupAudio(playerStore: ReturnType<typeof usePlayerStore>, mainStore: ReturnType<typeof useMainStore>, api: API) {
  playerStore.api = api
  audio.ontimeupdate = (time: number) => {
    playerStore.currentTime = time
    if (!playerStore.track) return
    const remaining = playerStore.duration - time
    if (remaining <= 0.2 && playerStore.hasNext) {
      playerStore.queueIndex++
      playerStore.setQueueIndex(playerStore.queueIndex)
      audio.changeTrack({ ...playerStore.track })
    }
    if (!track?.isStream) {
      if (
        playerStore.track &&
        playerStore.scrobbled === false &&
        playerStore.duration > 30 &&
        playerStore.currentTime / playerStore.duration > 0.7
      ) {
        playerStore.scrobbled = true
        return api.scrobble(playerStore.track.id)
      }
    }
  }
  audio.ondurationchange = (value: number) => {
    if (isFinite(value)) {
      playerStore.duration = value
    }
  }
  audio.onended = () => {
    if (playerStore.hasNext || playerStore.repeat) {
      return playerStore.next()
    } else {
      return playerStore.resetQueue()
    }
  }
  audio.onpause = () => {
    playerStore.setPaused()
  }
  audio.onstreamtitlechange = (value: string | null) => {
    playerStore.streamTitle = value
    const track = playerStore.track
    if (!track) return
    const streamTrack = {
      ...track,
      title: value || track.title || 'Live Stream',
      artist: track.artists || 'Unknown Artist',
      album: track.album || 'Radio',
      image:
        track.image ||
        '/images/radio-default-256.png',
      duration: track.duration || Infinity,
    }
    setMediaSession({
      track: streamTrack,
      currentTime: playerStore.currentTime,
      playbackRate: 1.0,
      isPlaying: playerStore.isPlaying,
    })
  }
  audio.onerror = (error: any) => {
    if (playerStore.hasNext) {
      playerStore.next()
    } else {
      playerStore.resetQueue()
    }
    mainStore.setError(error)
  }

  audio.setReplayGainMode(storedReplayGainMode)
  audio.setVolume(storedVolume)

  const track = playerStore.track
  if (track?.url) {
    audio.changeTrack({ ...track, paused: true })
    playerStore.preloadNext()
  }

  window.addEventListener('beforeunload', () => {
    api.savePlayQueue(playerStore.queue!, playerStore.track, 0)
    if (mediaSession) {
      mediaSession.metadata = null
      mediaSession.playbackState = 'none'
    }
  })

  // window.addEventListener('load', () => { ... })

  if (mediaSession) {
    setInterval(() => {
      setMediaSession({
        track: playerStore.track,
        currentTime: playerStore.currentTime,
        playbackRate: 1.0,
        isPlaying: playerStore.isPlaying,
      })
    }, 1000)
    mediaSession.setActionHandler('play', () => {
      playerStore.resume()
    })
    mediaSession.setActionHandler('pause', () => {
      playerStore.pause()
    })
    mediaSession.setActionHandler('nexttrack', () => {
      playerStore.next()
    })
    mediaSession.setActionHandler('previoustrack', () => {
      playerStore.previous()
    })
    mediaSession.setActionHandler('stop', () => {
      playerStore.pause()
    })
    mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime) {
        audio.seek(details.seekTime)
      }
    })
    mediaSession.setActionHandler('seekforward', (details) => {
      const offset = details.seekOffset || 10
      audio.seek(Math.min(audio.currentTime() + offset, audio.duration()))
    })
    mediaSession.setActionHandler('seekbackward', (details) => {
      const offset = details.seekOffset || 10
      audio.seek(Math.max(audio.currentTime() - offset, 0))
    })

    // Update now playing
    watch(
      () => playerStore.trackId,
      () => {
        const track = playerStore.track
        if (track && !track.isStream) {
          return api.updateNowPlaying(track.id)
        }
      })
  }
}
