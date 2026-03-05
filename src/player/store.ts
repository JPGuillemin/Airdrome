import { watch } from 'vue'
import { defineStore } from 'pinia'
import { shuffle, shuffled, trackListEquals, formatArtists } from '@/shared/utils'
import { Track } from '@/shared/api'
import { AudioController, ReplayGainMode } from '@/player/audio'
import { useMainStore } from '@/shared/store'
import { throttle } from 'lodash-es'
import { useRadioStore } from './radio'
import { useCacheStore } from '@/player/cache'

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
    isPlaying: false,
    duration: 0.0,
    currentTime: 0.0,
    playbackRate: pauseRate,
    replayGainMode: storedReplayGainMode as ReplayGainMode,
    repeat: localStorage.getItem('player.repeat') === 'true',
    shuffle: localStorage.getItem('player.shuffle') === 'true',
    volume: storedVolume,
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
    trackOffset(offset: number): Track | null {
      if (!this.queue || this.queue.length === 0 || this.queueIndex < 0) return null

      const len = this.queue.length
      const nextIndex = (this.queueIndex + offset + len) % len

      return this.queue[nextIndex]
    },
    async cacheTrack(url: string) {
      const cacheStore = useCacheStore()
      cacheStore.cacheTrack(url!)
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
      await audio.loadTrack({
        url: this.track!.url,
        replayGain: this.track!.replayGain,
        nextUrl: this.trackOffset(1)?.url,
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
      await audio.loadTrack({
        url: this.track!.url,
        replayGain: this.track!.replayGain,
        nextUrl: this.trackOffset(1)?.url,
        fade: true
      })
    },
    async play() {
      if (audio.playbackStatus === 'playing') return
      this.wasPaused = false
      await audio.play()
    },
    async pause() {
      if (audio.playbackStatus === 'paused') return
      this.wasPaused = true
      await audio.pause()
    },
    async playPause() {
      if (audio.playbackStatus === 'playing') {
        this.wasPaused = true
        return this.pause()
      } else {
        this.wasPaused = false
        return this.play()
      }
    },
    async next() {
      this.setQueueIndex(this.queueIndex + 1)
      await audio.loadTrack({
        url: this.track!.url,
        replayGain: this.track!.replayGain,
        nextUrl: this.trackOffset(1)?.url,
        fade: true
      })
    },
    async autoNext() {
      this.setQueueIndex(this.queueIndex + 1)
      await audio.loadTrack({
        url: this.track!.url,
        replayGain: this.track!.replayGain,
        nextUrl: this.trackOffset(1)?.url,
        fade: false
      })
    },
    async previous() {
      this.setQueueIndex(this.currentTime > 3 ? this.queueIndex : this.queueIndex - 1)
      await audio.loadTrack({
        url: this.track!.url,
        replayGain: this.track!.replayGain,
        nextUrl: this.trackOffset(1)?.url,
        fade: true
      })
    },
    async seek(value: number) {
      await audio.seek(value)
      this.setMediaSessionPosition()
    },
    async loadQueue() {
      const { tracks, currentTrack, currentTrackPosition } = await this.api.getPlayQueue()
      if (!tracks) {
        return
      }
      this.setQueue(tracks)
      this.setQueueIndex(currentTrack)
      if (!this.track) {
        return
      }
      await audio.loadTrack({
        url: this.track!.url,
        replayGain: this.track!.replayGain,
        nextUrl: this.trackOffset(1)?.url,
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
      await audio.loadTrack({
        url: this.track!.url,
        replayGain: this.track!.replayGain,
        nextUrl: this.trackOffset(1)?.url,
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
      if (tracks.length === 1 && tracks[0].id === this.trackOffset(1)?.id) {
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
    setVolume(value: number) {
      audio.setVolume(value)
      this.volume = value
      localStorage.setItem('player.volume', String(value))
    },
    setShuffle(enable: boolean) {
      this.shuffle = enable
      localStorage.setItem('player.shuffle', String(enable))
    },
    setQueue(queue: Track[]) {
      this.queue = queue
      this.queueIndex = -1
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
        mediaSession.metadata = new MediaMetadata({
          title: this.track.title,
          artist: formatArtists(this.track.artists),
          album: this.track.album,
          artwork:
            navigator.onLine && this.track.image
              ? [{ src: this.track.image, sizes: '300x300' }]
              : undefined,
        })
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
      if (audio.playbackStatus === 'playing') {
        clearInterval(interval)
        resumeToken = false
        return
      }

      try {
        await playerStore.play()
      } catch {}
    }, 2000)
  }

  audio.ontimeupdate = (value: number) => {
    playerStore.currentTime = value
  }

  audio.ondurationchange = (value: number) => {
    playerStore.duration = value
  }

  window.addEventListener('beforeunload', () => {
    playerStore.pause()

    if (navigator.onLine) {
      playerStore.api.savePlayQueue(
        playerStore.queue!,
        playerStore.track,
        Math.trunc(playerStore.currentTime)
      )
        .catch(err => {
          console.info('savePlayQueue aborted:', err)
        })
    }

    playerStore.setMediaSessionPosition(
      playerStore.duration,
      pauseRate,
      0.0
    )
  })

  audio.onended = async () => {
    await playerStore.autoNext()
    const track = playerStore.track
    if (!track?.url) return
    try {
      const radioStore = useRadioStore()
      await radioStore.continueFromTrack(track)
    } catch (err) {
      console.info('[Radio continuation failed]')
      playerStore.resetQueue()
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

  if (track?.url) {
    audio.loadTrack({
      url: playerStore.track!.url,
      replayGain: playerStore.track!.replayGain,
      nextUrl: playerStore.trackOffset(1)?.url,
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
    mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime) {
        audio.seek(Math.min(details.seekTime, playerStore.duration))
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

  watch(
    () => playerStore.currentTime,
    (t) => {
      if (!playerStore.track || !playerStore.isPlaying) return

      const remaining = playerStore.duration - t
      if (remaining <= 0.25 && playerStore.hasNext) {
        playerStore.autoNext()
      }
    }
  )

  watch(
    () => playerStore.currentTime,
    throttle(() => {
      if (playerStore.track) {
        playerStore.setMediaSessionPosition()
      }
    }, 300)
  )

  watch(
    () => playerStore.currentTime / playerStore.duration,
    (progress) => {
      if (
        !playerStore.scrobbled &&
        progress > 0.5 &&
        playerStore.track &&
        audio.playbackStatus === 'playing'
      ) {
        playerStore.scrobbled = true
        playerStore.api.scrobble(playerStore.track.id)
        // console.info('api.scrobble:', playerStore.track.url!)
        playerStore.cacheTrack(playerStore.track.url!)
        // console.info('cacheTrack:', playerStore.track.url!)
      }
    }
  )

  setInterval(() => {
    if (!playerStore.track) return

    playerStore.api.savePlayQueue(
      playerStore.queue!,
      playerStore.track,
      Math.trunc(playerStore.currentTime)
    )
      .catch(err => {
        console.info('savePlayQueue aborted:', err)
      }
    )
  }, 10000)

  //watch(
    //() => [playerStore.duration],
    //() => {
      //if (!playerStore.track) return

      //playerStore.setMediaSessionPosition()

      //playerStore.api.scrobble(playerStore.track.id)
      //playerStore.api.savePlayQueue(
        //playerStore.queue!,
        //playerStore.track,
        //Math.trunc(playerStore.currentTime)
      //)
        //.catch(err => {
          //console.info('savePlayQueue aborted:', err)
        //})
    //}
  //)
}
