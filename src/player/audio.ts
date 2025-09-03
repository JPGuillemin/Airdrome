import IcecastMetadataStats from 'icecast-metadata-stats'

export enum ReplayGainMode {
  None,
  Track,
  Album,
  _Length
}

type ReplayGain = {
  trackGain: number // dB
  trackPeak: number // 0.0-1.0
  albumGain: number // dB
  albumPeak: number // 0.0-1.0
}

async function UrlFetch(url: string, maxRetries = 5, retryDelay = 2000): Promise<string> {
  let attempt = 0
  while (attempt <= maxRetries) {
    try {
      console.info(`UrlFetch: attempt ${attempt + 1} for ${url}`)
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return url
    } catch (err) {
      console.warn(`UrlFetch: failed (attempt ${attempt + 1})`, err)
      attempt++
      if (attempt > maxRetries) throw err
      await new Promise<void>((resolve) => {
        setTimeout(resolve, retryDelay)
      })
    }
  }
  throw new Error('UrlFetch: unexpected exit')
}

export class AudioController {
  private fadeDuration = 0.4

  private buffer: HTMLAudioElement | null = null
  private statsListener : any = null
  private replayGainMode = ReplayGainMode.None
  private replayGain: ReplayGain | null = null

  private context = new AudioContext()
  private pipeline = creatPipeline(this.context, {})

  ontimeupdate: (value: number) => void = () => { /* do nothing */ }
  ondurationchange: (value: number) => void = () => { /* do nothing */ }
  onpause: () => void = () => { /* do nothing */ }
  onstreamtitlechange: (value: string | null) => void = () => { /* do nothing */ }
  onended: () => void = () => { /* do nothing */ }
  onerror: (err: MediaError | null) => void = () => { /* do nothing */ }

  currentTime() {
    return this.pipeline.audio.currentTime
  }

  duration() {
    return this.pipeline.audio.duration
  }

  async setBuffer(url: string) {
    this.buffer = null
    const FetchedUrl = await UrlFetch(url)
    this.buffer = new Audio(FetchedUrl)
    this.buffer.crossOrigin = 'anonymous'
    this.buffer.preload = 'auto'
    try {
      this.buffer.load()
    } catch {
      /* ignore */
    }
  }

  setVolume(value: number) {
    this.pipeline.volumeNode.gain.value = value
  }

  setReplayGainMode(value: ReplayGainMode) {
    this.replayGainMode = value
    this.pipeline.replayGainNode.gain.value = this.replayGainFactor()

    if (value === ReplayGainMode.None) {
      this.pipeline.normalizerNode.threshold.value = 0
      this.pipeline.normalizerNode.knee.value = 0
      this.pipeline.normalizerNode.ratio.value = 1.0
    } else {
      this.pipeline.normalizerNode.threshold.value = -3.0
      this.pipeline.normalizerNode.knee.value = 3.0
      this.pipeline.normalizerNode.ratio.value = 2.0
      this.pipeline.normalizerNode.attack.value = 0.01
      this.pipeline.normalizerNode.release.value = 0.1
    }

    console.log('Set replay gain: ' + this.replayGainFactor())
  }

  setPlaybackRate(value: number) {
    this.pipeline.audio.playbackRate = value
  }

  async pause() {
    await this.fadeOut()
    this.pipeline.audio.pause()
  }

  async resume() {
    await this.context.resume()
    await this.pipeline.audio.play()
    await this.fadeIn()
  }

  async seek(value: number) {
    if (!this.pipeline.audio.paused) {
      await this.fadeOut(this.fadeDuration / 2.0)
    }
    this.pipeline.audio.currentTime = value
    if (!this.pipeline.audio.paused) {
      await this.fadeIn(this.fadeDuration / 2.0)
    }
  }

  async changeTrack(options: { url?: string, paused?: boolean, replayGain?: ReplayGain, isStream?: boolean, playbackRate?: number }) {
    if (this.pipeline.audio) {
      endPlayback(this.context, this.pipeline, 1.0)
    }

    this.replayGain = options.replayGain || null

    if (this.buffer && this.buffer.src === options.url) {
      this.pipeline = creatPipeline(this.context, {
        audio: this.buffer,
        volume: this.pipeline.volumeNode.gain.value,
        replayGain: this.replayGainFactor(),
      })
      console.info('AudioController: using buffer for ', options.url)
      await this.startTrack(options.url, options.paused)
      this.SetIcecast(options.url, options.isStream, options.playbackRate)
    } else if (options.url) {
      const FetchedUrl = await UrlFetch(options.url)
      this.pipeline = creatPipeline(this.context, {
        url: FetchedUrl,
        volume: this.pipeline.volumeNode.gain.value,
        replayGain: this.replayGainFactor(),
      })
      console.info('AudioController: no buffer, fetching ', FetchedUrl)
      await this.startTrack(FetchedUrl, options.paused)
      this.SetIcecast(FetchedUrl, options.isStream, options.playbackRate)
      await this.fadeIn(0.4)
    }
  }

  private async startTrack(url?: string, paused?: boolean) {
    this.setReplayGainMode(this.replayGainMode)

    this.pipeline.audio.onerror = () => {
      this.onerror(this.pipeline.audio.error)
    }
    this.pipeline.audio.onended = () => {
      this.onended()
    }
    this.pipeline.audio.ontimeupdate = () => {
      this.ontimeupdate(this.pipeline.audio.currentTime)
    }
    this.pipeline.audio.ondurationchange = () => {
      this.ondurationchange(this.pipeline.audio.duration)
    }
    this.pipeline.audio.onpause = () => {
      this.onpause()
    }
    this.ondurationchange(this.pipeline.audio.duration)
    this.ontimeupdate(this.pipeline.audio.currentTime)

    if (paused !== true) {
      try {
        this.context.resume()
        this.pipeline.audio.play()
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.warn(error)
          return
        }
        throw error
      }
    }
  }

  private async fadeIn(duration: number = this.fadeDuration) {
    const value = this.pipeline.fadeNode.gain.value
    this.pipeline.fadeNode.gain.cancelScheduledValues(0)
    this.pipeline.fadeNode.gain.setValueAtTime(value, this.context.currentTime)
    this.pipeline.fadeNode.gain.linearRampToValueAtTime(1, this.context.currentTime + duration)
    await sleep(duration * 1000)
  }

  private async fadeOut(duration: number = this.fadeDuration) {
    const value = this.pipeline.fadeNode.gain.value
    this.pipeline.fadeNode.gain.cancelScheduledValues(0)
    this.pipeline.fadeNode.gain.setValueAtTime(value, this.context.currentTime)
    this.pipeline.fadeNode.gain.linearRampToValueAtTime(0, this.context.currentTime + duration)
    await sleep(duration * 1000)
  }

  private replayGainFactor(): number {
    if (this.replayGainMode === ReplayGainMode.None || !this.replayGain) {
      return 1.0
    }

    const gain = this.replayGainMode === ReplayGainMode.Track
      ? this.replayGain.trackGain
      : this.replayGain.albumGain

    const peak = this.replayGainMode === ReplayGainMode.Track
      ? this.replayGain.trackPeak
      : this.replayGain.albumPeak

    if (!Number.isFinite(gain) || !Number.isFinite(peak) || peak <= 0) {
      console.warn('AudioController: invalid ReplayGain settings', this.replayGain)
      return 1.0
    }

    const preAmp = 6.0
    const gainFactor = Math.pow(10, (gain + preAmp) / 20)
    const peakFactor = 1 / peak
    const factor = Math.min(gainFactor, peakFactor)
    console.info('AudioController: calculated ReplayGain factor', factor)
    return factor
  }

  private async SetIcecast(url?: string, isStream?: boolean, playbackRate?: number) {
    this.statsListener?.stop()
    if (isStream) {
      this.onstreamtitlechange(null)
      this.pipeline.audio.playbackRate = playbackRate ?? 1.0
      console.info('Icecast: starting stats listener')
      this.statsListener = new IcecastMetadataStats(url, {
        sources: ['icy'],
        onStats: (stats: any) => {
          if (stats?.icy === undefined) {
            console.info('Icecast: no metadata found. Stopping')
            this.statsListener?.stop()
          } else if (stats?.icy?.StreamTitle) {
            this.onstreamtitlechange(stats?.icy?.StreamTitle)
          }
        }
      })
      this.statsListener?.start()
      this.pipeline.audio.load()
    }
  }
}

function creatPipeline(context: AudioContext, options: { url?: string, audio?: HTMLAudioElement, volume?: number, replayGain?: number }) {
  let audio: HTMLAudioElement
  if (options.audio) {
    audio = options.audio
  } else {
    audio = options.url ? new Audio(options.url) : new Audio()
    audio.crossOrigin = 'anonymous'
    audio.preload = 'auto'
  }

  const sourceNode = context.createMediaElementSource(audio)

  const volumeNode = context.createGain()
  volumeNode.gain.value = options.volume ?? 1

  const replayGainNode = context.createGain()
  replayGainNode.gain.value = options.replayGain ?? 1

  const fadeNode = context.createGain()
  fadeNode.gain.value = 1

  const normalizerNode = context.createDynamicsCompressor()
  normalizerNode.threshold.value = 0

  sourceNode
    .connect(volumeNode)
    .connect(replayGainNode)
    .connect(fadeNode)
    .connect(normalizerNode)
    .connect(context.destination)

  function disconnect() {
    audio.pause()
    sourceNode.disconnect()
    volumeNode.disconnect()
    replayGainNode.disconnect()
    fadeNode.disconnect()
    normalizerNode.disconnect()
  }

  return { audio, volumeNode, replayGainNode, fadeNode, normalizerNode, disconnect }
}

function endPlayback(context: AudioContext, pipeline: ReturnType<typeof creatPipeline>, duration: number) {
  console.info(`AudioController: ending payback for ${pipeline.audio}`)
  pipeline.audio.ontimeupdate = null
  pipeline.audio.ondurationchange = null
  pipeline.audio.onpause = null
  pipeline.audio.onerror = null
  pipeline.audio.onended = null
  pipeline.audio.onloadedmetadata = null

  pipeline.fadeNode.gain.cancelScheduledValues(0)
  pipeline.fadeNode.gain.linearRampToValueAtTime(0, context.currentTime + duration)

  const startTime = Date.now()
  setTimeout(() => {
    console.info(`AudioController: ending payback done. actual ${Date.now() - startTime}ms`)
    pipeline.disconnect()
  }, duration * 1000)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
