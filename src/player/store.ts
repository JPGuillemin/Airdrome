import { defineStore } from 'pinia'
import { shuffle, shuffled, trackListEquals, formatArtists } from '@/shared/utils'
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
    replayGainMode: storedReplayGainMode as ReplayGainMode,
    repeat: localStorage.getItem('player.repeat') !== 'false',
    shuffle: localStorage.getItem('player.shuffle') === 'true',
    volume: storedVolume,
    scrobbled: false,
    userPaused: false,
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
      if (this.duration > 0) {
        return Math.min(this.currentTime / this.duration, 1)
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
      this.setMediaSessionPosition()
      this.preloadNext()
    },
    async resume() {
      this.userPaused = false
      this.setPlaying()
      await audio.resume()
      this.setMediaSessionPosition()
    },
    async play() {
      this.userPaused = false
      this.setPlaying()
      await audio.play()
      this.setMediaSessionPosition()
    },
    async pause() {
      audio.pause()
      this.setMediaSessionPosition()
      this.setPaused()
    },
    async playPause() {
      if (this.isPlaying) {
        this.userPaused = true
        return this.pause()
      } else {
        this.userPaused = false
        return this.resume()
      }
    },
    async next() {
      this.setQueueIndex(this.queueIndex + 1)
      this.setPlaying()
      await audio.changeTrack({ ...this.track })
      this.setMediaSessionPosition()
      this.preloadNext()
    },
    async previous() {
      this.setQueueIndex(this.currentTime > 3 ? this.queueIndex : this.queueIndex - 1)
      this.setPlaying()
      await audio.changeTrack(this.track!)
      this.setMediaSessionPosition()
      this.preloadNext()
    },
    async seek(value: number) {
      if (isFinite(this.duration)) {
        await audio.seek(this.duration * value)
      }
      this.setMediaSessionPosition()
    },
    async loadQueue() {
      const { tracks, currentTrack, currentTrackPosition } = await this.api!.getPlayQueue()
      this.setQueue(tracks)
      this.setQueueIndex(currentTrack)
      this.setPaused()
      await audio.changeTrack({ ...this.track, paused: true })
      await audio.seek(currentTrackPosition)
      this.setMediaSessionPosition()
      this.preloadNext()
    },
    async resetQueue() {
      this.setQueueIndex(0)
      this.setPaused()
      await audio.changeTrack({ ...this.track, paused: true })
      this.setMediaSessionPosition()
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
        await audio.changeTrack({ })
      }
    },
    setMediaSessionPosition() {
      if (mediaSession) {
        mediaSession.setPositionState({
          duration: this.duration || Infinity,
          playbackRate: 1.0,
          position: Math.min(this.currentTime, this.duration) || 0.0,
        })
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
      if (mediaSession) {
        mediaSession.playbackState = 'playing'
      }
      this.isPlaying = true
    },
    setPaused() {
      this.isPlaying = false
      if (mediaSession) {
        mediaSession.playbackState = 'paused'
      }
    },
    setQueue(queue: Track[]) {
      this.queue = queue
      this.queueIndex = -1
    },
    setQueueIndex(index: number) {
      if (!this.queue || this.queue.length === 0) {
        this.queueIndex = -1
        this.duration = Infinity
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
        mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: formatArtists(track.artists),
          album: track.album,
          artwork: track.image ? [{ src: track.image, sizes: '300x300' }] : undefined,
        })
        mediaSession.setPositionState({
          duration: this.duration || Infinity,
          playbackRate: 1.0,
          position: 0.0,
        })
      }
      this.api!.updateNowPlaying(track.id)
      this.api!.savePlayQueue(this.queue!, this.track, 0.0)
    },
  },
})

export function setupAudio(playerStore: ReturnType<typeof usePlayerStore>, mainStore: ReturnType<typeof useMainStore>, api: API) {
  playerStore.api = api
  audio.ontimeupdate = (time: number) => {
    playerStore.currentTime = time || 0.0
    if (!playerStore.track || !playerStore.isPlaying) return
    const remaining = playerStore.duration - playerStore.currentTime
    if (remaining <= 0.4 && playerStore.hasNext) {
      playerStore.queueIndex++
      playerStore.setQueueIndex(playerStore.queueIndex)
      audio.changeTrack({ ...playerStore.track })
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
    api.savePlayQueue(playerStore.queue!, playerStore.track, 0.0)
    if (mediaSession) {
      mediaSession.playbackState = 'paused'
    }
  })

  window.addEventListener('load', () => {
    if (mediaSession) {
      mediaSession.playbackState = 'paused'
    }
  })

  if (mediaSession) {
    mediaSession.setActionHandler('play', () => {
      playerStore.resume()
    })
    mediaSession.setActionHandler('pause', () => {
      playerStore.pause()
    })
    mediaSession.setActionHandler('hangup' as any, () => {
      if (!playerStore.userPaused) {
        playerStore.resume()
      }
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
      audio.seek(Math.min(playerStore.currentTime + offset, playerStore.duration))
    })
    mediaSession.setActionHandler('seekbackward', (details) => {
      const offset = details.seekOffset || 10
      audio.seek(Math.max(playerStore.currentTime - offset, 0))
    })
  }
}
