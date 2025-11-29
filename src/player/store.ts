import { watch } from 'vue'
import { defineStore } from 'pinia'
import { shuffle, shuffled, trackListEquals, formatArtists, sleep } from '@/shared/utils'
import { API, Track } from '@/shared/api'
import { AudioController, ReplayGainMode } from '@/player/audio'
import { useMainStore } from '@/shared/store'
import { throttle } from 'lodash-es'

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
    userPaused: false,
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
      await audio.loadTrack({ ...this.track, nextUrl: this.getNextUrl() })
      this.setPlaying()
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
      await audio.loadTrack({ ...this.track, nextUrl: this.getNextUrl() })
      this.setPlaying()
    },
    async play() {
      this.userPaused = false
      await audio.play()
      this.setPlaying()
    },
    async pause() {
      await audio.pause()
      this.setPaused()
    },
    async playPause() {
      if (this.isPlaying) {
        this.userPaused = true
        return this.pause()
      } else {
        this.userPaused = false
        return this.play()
      }
    },
    async next() {
      this.setQueueIndex(this.queueIndex + 1)
      await audio.loadTrack({ ...this.track, nextUrl: this.getNextUrl() })
      this.setPlaying()
    },
    async previous() {
      this.setQueueIndex(this.currentTime > 3 ? this.queueIndex : this.queueIndex - 1)
      await audio.loadTrack({ ...this.track!, nextUrl: this.getNextUrl() })
      this.setPlaying()
    },
    async seek(value: number) {
      await audio.seek(value)
      this.setMediaSessionPosition()
    },
    async loadQueue() {
      const { tracks, currentTrack, currentTrackPosition } = await this.api!.getPlayQueue()
      this.setQueue(tracks)
      this.setQueueIndex(currentTrack)
      await audio.loadTrack({ ...this.track, nextUrl: this.getNextUrl(), paused: true })
      await audio.seek(currentTrackPosition)
      this.setPaused()
    },
    async resetQueue() {
      this.setQueueIndex(0)
      await audio.loadTrack({ ...this.track, nextUrl: this.getNextUrl(), paused: true })
      this.setPaused()
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
        await audio.loadTrack({ })
        this.setPaused()
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
    getNextUrl() {
      if (this.queue && this.queue.length > 0) {
        const next = (this.queueIndex + 1) % this.queue.length
        const nextTrack = this.queue[next]
        if (nextTrack?.url) {
          return nextTrack.url
        }
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
        this.setMediaSessionPosition(undefined, playRate, undefined)
      }
      this.isPlaying = true
    },
    setPaused() {
      this.isPlaying = false
      if (mediaSession) {
        mediaSession.playbackState = 'paused'
        this.setMediaSessionPosition(undefined, pauseRate, undefined)
      }
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
      }
      this.setMediaSessionPosition(this.duration, playRate, this.currentTime)
    },
  },
})

export function setupAudio(playerStore: ReturnType<typeof usePlayerStore>, mainStore: ReturnType<typeof useMainStore>, api: API) {
  playerStore.api = api

  audio.ontimeupdate = (value: number) => {
    playerStore.currentTime = value
  }

  audio.ondurationchange = (value: number) => {
    playerStore.duration = value
  }

  window.addEventListener('beforeunload', () => {
    playerStore.pause()
    api.savePlayQueue(playerStore.queue!, playerStore.track, Math.trunc(playerStore.currentTime))
    playerStore.setMediaSessionPosition(playerStore.duration, pauseRate, 0.0)
  })

  audio.onended = async() => {
    const { hasNext, repeat } = playerStore

    if (hasNext || repeat) return playerStore.next()

    if (!playerStore.track) return

    const lastTrack = playerStore.track

    try {
      const artistId = lastTrack.artists?.[0]?.id
      if (artistId) {
        try {
          const similarTracks = await api.getSimilarTracksByArtist(artistId, 50)
          if (similarTracks?.length) {
            console.info(`Auto-continued with similar tracks by artist: ${lastTrack.artists?.[0]?.name}`)
            playerStore.setQueue([])
            playerStore.setQueueIndex(-1)

            const shuffledTracks = shuffled(similarTracks) as Track[]
            playerStore.addToQueue(shuffledTracks)
            playerStore.setQueueIndex(0)
            await audio.loadTrack({ ...playerStore.track, nextUrl: playerStore.getNextUrl() })
            playerStore.setPlaying()
            return
          }
        } catch (artistErr) {
          console.warn('Error fetching similar tracks by artist:', artistErr)
        }
      }

      let genreName: string | undefined = (lastTrack as any).genre

      if (!genreName && lastTrack.albumId) {
        const album = await api.getAlbumDetails(lastTrack.albumId)
        genreName = album.genres?.[0]?.name
      }

      if (!genreName) {
        console.warn('No genre found for last track — ending playback.')
        return playerStore.resetQueue()
      }

      const similarTracks = await api.getTracksByGenre(genreName, 50) as Track[]
      if (!similarTracks?.length) {
        console.warn(`No tracks found for genre "${genreName}"`)
        return playerStore.resetQueue()
      }

      playerStore.setQueue([])
      playerStore.setQueueIndex(-1)

      const shuffledTracks = shuffled(similarTracks) as Track[]
      playerStore.addToQueue(shuffledTracks)
      playerStore.setQueueIndex(0)
      await audio.loadTrack({ ...playerStore.track, nextUrl: playerStore.getNextUrl() })
      playerStore.setPlaying()
      console.info(`Auto-continued with genre: ${genreName}`)
    } catch (error) {
      console.error('Error fetching radio-like continuation:', error)
      playerStore.resetQueue()
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
    audio.loadTrack({ ...track, nextUrl: playerStore.getNextUrl(), paused: true })
  }

  if (mediaSession) {
    mediaSession.setActionHandler('play', () => {
      playerStore.play()
    })
    mediaSession.setActionHandler('pause', () => {
      playerStore.pause()
    })
    mediaSession.setActionHandler('hangup' as any, () => {
      console.info('hangup')
      if (!playerStore.userPaused) {
        playerStore.play()
        sleep(1000)
        playerStore.play()
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
      if (remaining <= 0.15 && playerStore.hasNext) {
        playerStore.queueIndex++
        playerStore.setQueueIndex(playerStore.queueIndex)
        audio.loadTrack({
          ...playerStore.track,
          nextUrl: playerStore.getNextUrl()
        })
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
      if (!playerStore.scrobbled &&
          progress > 0.7 &&
          playerStore.track &&
          playerStore.isPlaying
      ) {
        playerStore.scrobbled = true
        api.scrobble(playerStore.track.id)
      }
    }
  )

  setInterval(() => {
    if (!playerStore.track) return

    api.savePlayQueue(
      playerStore.queue!,
      playerStore.track,
      Math.trunc(playerStore.currentTime)
    )
  }, 10000)

  watch(
    () => [playerStore.duration],
    () => {
      if (playerStore.track) {
        playerStore.setMediaSessionPosition()
        api.updateNowPlaying(playerStore.track.id)
        api.savePlayQueue(
          playerStore.queue!,
          playerStore.track,
          Math.trunc(playerStore.currentTime)
        )
      }
    }
  )
}
