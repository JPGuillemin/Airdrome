import { watch } from 'vue'
import { defineStore } from 'pinia'
import { shuffle, shuffled, trackListEquals, formatArtists, sleep } from '@/shared/utils'
import { Track } from '@/shared/api'
import { AudioController, ReplayGainMode } from '@/player/audio'
import { useMainStore } from '@/shared/store'
import { throttle } from 'lodash-es'
import { useRadioStore } from './radio'

localStorage.removeItem('player.mute')
localStorage.removeItem('queue')
localStorage.removeItem('queueIndex')

const storedVolume = parseFloat(localStorage.getItem('player.volume') || '1.0')
const storedReplayGainMode = parseInt(localStorage.getItem('player.replayGainMode') ?? '0')
const mediaSession: MediaSession | undefined = navigator.mediaSession
const audio = new AudioController()
const pauseRate = 0.00001
const playRate = 1.0

export const usePlayerStore = defineStore('player', {
  state: () => ({
    queue: [] as Track[],
    queueIndex: -1,
    duration: 0.0,
    currentTime: 0.0,
    playbackRate: pauseRate,
    replayGainMode: storedReplayGainMode as ReplayGainMode,
    repeat: localStorage.getItem('player.repeat') === 'true',
    shuffle: localStorage.getItem('player.shuffle') === 'true',
    volume: storedVolume,
    isPlaying: false,
    scrobbled: false,
    wasPaused: true,
  }),
  getters: {
    track(): Track | null {
      if (this.queue && this.queueIndex !== -1) {
        return this.queue[this.queueIndex]
      }
      return null
    },

    nextTrack(): Track | null {
      if (this.queue && this.queue.length > 0) {
        const next = (this.queueIndex + 1) % this.queue.length
        return this.queue[next]
      }
      return null
    },

    trackId(): string | null {
      return this.track?.id ?? null
    },

    progress(): number {
      if (this.duration > 0) {
        return Math.min(this.currentTime, this.duration)
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
      const track = this.track
      const nextTrack = this.nextTrack
      if (!track) return
      await audio.loadTrack({
        url: track.url,
        replayGain: track.replayGain,
        nextUrl: nextTrack?.url,
        fade: true
      })
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
      const track = this.track
      const nextTrack = this.nextTrack
      if (!track) return
      await audio.loadTrack({
        url: track.url,
        replayGain: track.replayGain,
        nextUrl: nextTrack?.url,
        fade: true
      })
    },

    async play() {
      this.setMediaSessionPosition(undefined, playRate, undefined)
      this.wasPaused = false
      await audio.play()
    },

    async pause() {
      this.setMediaSessionPosition(undefined, pauseRate, undefined)
      this.wasPaused = true
      await audio.pause()
    },

    async playPause() {
      if (this.isPlaying === true) {
        return this.pause()
      } else {
        return this.play()
      }
    },

    async next() {
      this.setMediaSessionPosition(undefined, undefined, 0)
      if (this.hasNext || this.repeat) {
        this.setQueueIndex(this.queueIndex + 1)
        const track = this.track
        const nextTrack = this.nextTrack
        if (!track) return
        await audio.loadTrack({
          url: track.url,
          replayGain: track.replayGain,
          nextUrl: nextTrack?.url,
          fade: true
        })
      } else {
        await this.processQueueEnd()
      }
    },

    async skip() {
      this.setMediaSessionPosition(undefined, undefined, 0)
      this.setQueueIndex(this.queueIndex + 1)
      const track = this.track
      const nextTrack = this.nextTrack
      if (!track) return
      await audio.loadTrack({
        url: track.url,
        replayGain: track.replayGain,
        nextUrl: nextTrack?.url,
        fade: false
      })
    },

    async previous() {
      this.setMediaSessionPosition(undefined, undefined, 0)
      this.setQueueIndex(this.currentTime > 3 ? this.queueIndex : this.queueIndex - 1)
      const track = this.track
      const nextTrack = this.nextTrack
      if (!track) return
      await audio.loadTrack({
        url: track.url,
        replayGain: track.replayGain,
        nextUrl: nextTrack?.url,
        fade: true
      })
    },

    async seek(position: number) {
      await audio.seek(position)
    },

    async loadQueue() {
      const { tracks, currentTrack, currentTrackPosition } = await this.api.getPlayQueue()
      if (!tracks) {
        return
      }
      this.setQueue(tracks)
      this.setQueueIndex(currentTrack)
      const track = this.track
      const nextTrack = this.nextTrack
      if (!track) return
      await audio.loadTrack({
        url: track.url,
        replayGain: track.replayGain,
        nextUrl: nextTrack?.url,
        fade: true,
        paused: true
      })
      await audio.seek(currentTrackPosition)
    },

    async resetQueue() {
      if (!this.queue.length || !this.track?.url) {
        this.setQueueIndex(-1)
        return
      }
      this.setQueueIndex(0)
      const track = this.track
      const nextTrack = this.nextTrack
      if (!track) return
      await audio.loadTrack({
        url: track.url,
        replayGain: track.replayGain,
        nextUrl: nextTrack?.url,
        fade: true,
        paused: true
      })
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
        await audio.stop()
      }
    },

    async setMediaSessionPosition(duration?: number, rate?: number, position?: number) {
      if (!navigator.mediaSession) return
      duration ??= this.duration
      rate ??= this.playbackRate
      position ??= this.currentTime
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: rate,
        position: Math.min(position, duration),
      })
    },

    addToQueue(tracks: Track[]) {
      const lastTrack = this.queue && this.queue.length > 0 ? this.queue[this.queue.length - 1] : null
      if (tracks.length === 1 && tracks[0].id === lastTrack?.id) {
        return
      }
      this.queue?.push(...this.shuffle ? shuffled(tracks) : tracks)
    },

    setNextInQueue(tracks: Track[]) {
      if (tracks.length === 1 && tracks[0].id === this.nextTrack?.id) {
        return
      }
      this.queue?.splice(this.queueIndex + 1, 0, ...(this.shuffle ? shuffled(tracks) : tracks))
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

    setVolume(volume: number) {
      audio.setVolume(volume)
      this.volume = volume
      localStorage.setItem('player.volume', String(volume))
    },

    setShuffle(toggle: boolean) {
      this.shuffle = toggle
      localStorage.setItem('player.shuffle', String(toggle))
    },

    setQueue(queue: Track[]) {
      this.queue = queue
      this.queueIndex = -1
    },

    async processQueueEnd() {
      const track = this.track
      if (!track?.url) return

      try {
        const radioStore = useRadioStore()
        await radioStore.continueFromTrack(track)
      } catch {
        this.resetQueue()
      }
    },

    setQueueIndex(index: number) {
      if (!this.queue || this.queue.length === 0) {
        this.queueIndex = -1
        this.duration = 0
        if (mediaSession) {
          mediaSession.playbackState = 'paused'
        }
        return
      }
      index = Math.max(0, index)
      if (index >= this.queue.length) {
        if (this.repeat) {
          index = 0
        } else {
          this.queueIndex = this.queue.length - 1
          return
        }
      }
      this.queueIndex = index
      if (!this.track) return
      this.scrobbled = false
      this.duration = this.track.duration
      if (mediaSession) {
        const artwork: MediaImage[] = [];
        if (this.track.image) {
          artwork.push(
            { src: this.track.image, sizes: '96x96', type: 'image/png' },
            { src: this.track.image, sizes: '128x128', type: 'image/png' },
            { src: this.track.image, sizes: '192x192', type: 'image/png' },
            { src: this.track.image, sizes: '256x256', type: 'image/png' },
            { src: this.track.image, sizes: '384x384', type: 'image/png' },
            { src: this.track.image, sizes: '512x512', type: 'image/png' }
          );
        }
        navigator.mediaSession.metadata = new MediaMetadata({
          title: this.track.title || '',
          artist: formatArtists(this.track.artists) || '',
          album: this.track.album || '',
          artwork
        });
      }
      this.setMediaSessionPosition(this.duration, playRate, this.currentTime)
    },
  },
})

export function setupAudio(playerStore: ReturnType<typeof usePlayerStore>, mainStore: ReturnType<typeof useMainStore>) {
  const isMobile =
    matchMedia('(pointer: coarse)').matches &&
    navigator.maxTouchPoints > 0

  let resumeToken = false
  function autoResume() {
    if (!isMobile || playerStore.wasPaused || resumeToken || document.visibilityState !== 'visible') return

    resumeToken = true

    const interval = setInterval(async () => {
      if (playerStore.isPlaying === true) {
        clearInterval(interval)
        resumeToken = false
        return
      }

      try {
        await playerStore.loadQueue()
        await playerStore.play()
      } catch {}
    }, 2000)
  }

  const throttledMediaSessionUpdate = throttle(() => {
    void playerStore.setMediaSessionPosition(undefined, undefined, playerStore.currentTime)
  }, 500)

  audio.ontimeupdate = (time: number) => {
    playerStore.currentTime = time
    throttledMediaSessionUpdate()
  }

  audio.ondurationchange = (duration: number) => {
    playerStore.duration = duration
    playerStore.setMediaSessionPosition()
  }

  window.addEventListener('beforeunload', () => {
    playerStore.pause()
    const queue = playerStore.queue
    const track = playerStore.track
    const currentTime = playerStore.currentTime
    const duration = playerStore.duration
    playerStore.setMediaSessionPosition(
      duration,
      pauseRate,
      0
    )
    if (navigator.onLine && queue && track) {
      playerStore.api.savePlayQueue(
        queue,
        track,
        Math.trunc(currentTime)
      )
        .catch(err => {
          console.info('savePlayQueue aborted:', err)
        })
    }
  })

  audio.onended = async () => {
    const { hasNext, repeat } = playerStore
    if (hasNext || repeat) {
      await playerStore.skip()
    } else {
      await playerStore.processQueueEnd()
    }
  }

  audio.onplay = () => {
    playerStore.isPlaying = true
    if (mediaSession) mediaSession.playbackState = 'playing'
  }

  audio.onpause = () => {
    playerStore.isPlaying = false
    if (mediaSession) mediaSession.playbackState = 'paused'
    autoResume()
  }

  audio.onsuspend = () => {
    playerStore.isPlaying = false
    if (mediaSession) mediaSession.playbackState = 'paused'
    autoResume()
  }

  audio.onerror = (error: any) => {
    console.warn('[Audio error]', error)

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
  const nextTrack = playerStore.nextTrack
  if (track) {
    audio.loadTrack({
      url: track.url,
      replayGain: track.replayGain,
      nextUrl: nextTrack?.url,
      paused: true
    })
  }

  if (mediaSession) {
    mediaSession.setActionHandler('play', () => {
      playerStore.play()
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
    mediaSession.setActionHandler('seekto', async (details) => {
      if (details.fastSeek || details.seekTime === undefined) return
      const position = Math.min(details.seekTime, playerStore.duration)
      await audio.seek(position)
    })
    mediaSession.setActionHandler('seekforward', (details) => {
      const offset = details.seekOffset || 10
      playerStore.seek(Math.min(playerStore.currentTime + offset, playerStore.duration))
    })
    mediaSession.setActionHandler('seekbackward', (details) => {
      const offset = details.seekOffset || 10
      playerStore.seek(Math.max(playerStore.currentTime - offset, 0))
    })
  }

  let skipping = false
  watch(
    () => playerStore.currentTime,
    async (time) => {
      const track = playerStore.track
      const isPlaying = playerStore.isPlaying

      if (!track || !isPlaying || time < 20) return

      // autoplay next
      const duration = playerStore.duration
      const remaining = duration - time
      if (remaining < 0.25 && playerStore.hasNext && !skipping) {
        skipping = true
        try {
          await playerStore.skip()
        } finally {
          skipping = false
        }
        return
      }

      // scrobble logic
      const progress = duration ? time / duration : 0
      if (
        !playerStore.scrobbled &&
        progress > 0.5 &&
        track &&
        isPlaying === true
      ) {
        playerStore.scrobbled = true
        playerStore.api.scrobble(track.id)
      }
    }
  )

  setInterval(() => {
    const track = playerStore.track
    const queue = playerStore.queue

    if (!track || !queue) return

    const currentTime = playerStore.currentTime
    playerStore.api.savePlayQueue(
      queue,
      track,
      Math.trunc(currentTime)
    )
      .catch(err => {
        console.info('savePlayQueue aborted:', err)
      }
    )
  }, 10000)
}
