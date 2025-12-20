import { sleep } from '@/shared/utils'
import { useCacheStore } from '@/player/cache'

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

export class AudioController {
  private fadeTime = 0.3
  private changeToken = 0
  private buffer: HTMLAudioElement | null = null
  private statsListener : any = null
  private replayGainMode = ReplayGainMode.None
  private replayGain: ReplayGain | null = null
  private cachingQueue: Promise<void> = Promise.resolve()
  private context = new AudioContext()
  private pipeline = creatPipeline(this.context, {})

  ontimeupdate: (value: number) => void = () => { /* do nothing */ }
  ondurationchange: (value: number) => void = () => { /* do nothing */ }
  onpause: () => void = () => { /* do nothing */ }
  onended: () => void = () => { /* do nothing */ }
  onerror: (err: MediaError | null) => void = () => { /* do nothing */ }
  onfocus: () => void = () => { /* do nothing */ }
  onblur: () => void = () => { /* do nothing */ }
  onvisibilitychange: () => void = () => { /* do nothing */ }

  get audioElement(): HTMLAudioElement | undefined {
    return this.pipeline?.audio
  }

  currentTime() {
    return this.pipeline.audio.currentTime
  }

  duration() {
    return this.pipeline.audio.duration
  }

  async setCache(url: string) {
    this.cachingQueue = this.cachingQueue
      .catch(() => {})
      .then(async() => {
        try {
          const albumCache = useCacheStore()
          await albumCache.cacheTrack(url)
          window.dispatchEvent(new CustomEvent('audioCached', { detail: url }))
        } catch (err) {
          console.warn('setCache(): failed', url, err)
        }
      })
    return this.cachingQueue
  }

  async setBuffer(url: string) {
    this.buffer = null
    this.buffer = new Audio()
    this.buffer.crossOrigin = 'anonymous'
    this.buffer.preload = 'auto'
    this.buffer.src = url // start streaming immediately
    try { this.buffer.load() } catch { /* ignore */ }
    this.setCache(url)
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
    console.info('setReplayGainMode():', this.replayGainFactor())
  }

  async stop() {
    this.changeToken++
    if (this.pipeline?.audio) {
      this.pipeline.disconnect()
    }
  }

  async pause() {
    await this.fadeOut(this.fadeTime)
    this.pipeline.audio.pause()
  }

  async play() {
    try {
      if (this.context.state === 'suspended') {
        await this.context.resume()
      }
      await this.pipeline.audio.play()
      this.fadeIn(this.fadeTime)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn('Resume aborted')
        return
      }
      console.error('play(): failed:', err)
      throw err
    }
  }

  async seek(value: number) {
    if (!this.pipeline.audio.paused) {
      this.fadeOut(this.fadeTime / 2)
    }
    this.pipeline.audio.currentTime = value
    if (!this.pipeline.audio.paused) {
      this.fadeIn(this.fadeTime / 2)
    }
  }

  async loadTrack(options: { url?: string; nextUrl?: string; paused?: boolean; replayGain?: ReplayGain }) {
    const token = ++this.changeToken

    if (this.pipeline.audio) {
      endPlayback(this.context, this.pipeline)
    }

    this.replayGain = options.replayGain || null
    console.info('loadTrack(): Launching pipeline for ', options.url)
    let newPipeline: ReturnType<typeof creatPipeline> | undefined
    this.setBuffer(options.url!)
    newPipeline = creatPipeline(this.context, {
      audio: this.buffer!,
      volume: this.pipeline.volumeNode.gain.value,
      replayGain: this.replayGainFactor(),
    })

    if (token === this.changeToken) {
      this.pipeline.disconnect()
      this.pipeline = newPipeline!
      this.setReplayGainMode(this.replayGainMode)

      const audio = this.pipeline.audio

      audio.onerror = () => this.onerror(audio.error)
      audio.onended = () => this.onended()
      audio.ontimeupdate = () => this.ontimeupdate(audio.currentTime)
      audio.onpause = () => this.onpause()

      this.setupDurationListener(this.pipeline.audio)

      if (audio.readyState < 1) {
        try {
          audio.load()
        } catch {}
      }

      if (options.paused !== true) {
        try {
          await this.play()
          this.fadeIn(this.fadeTime)
        } catch (error: any) {
          if (error.name === 'AbortError') {
            console.error('loadTrack(): Audio play aborted due to rapid skip')
            return
          }
          throw error
        }
      }
      if (options.nextUrl) {
        this.setCache(options.nextUrl)
        console.info('loadTrack(): buffering ', options.nextUrl)
      }
    } else {
      newPipeline!.disconnect()
    }
  }

  private setupDurationListener(audio: HTMLAudioElement) {
    const updateDuration = () => {
      const duration = audio.duration
      if (duration && duration !== Infinity && !isNaN(duration)) {
        this.ondurationchange(duration)
      }
    }

    // Listen for metadata and readiness events
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('canplay', updateDuration)

    // Optional quick fallback: sometimes metadata loads slightly later
    const fallback = setTimeout(updateDuration, 200)
    audio.addEventListener('durationchange', () => clearTimeout(fallback))
  }

  private async fadeIn(duration = 0) {
    const value = this.pipeline.fadeNode.gain.value
    this.pipeline.fadeNode.gain.cancelScheduledValues(0)
    this.pipeline.fadeNode.gain.setValueAtTime(value, this.context.currentTime)
    this.pipeline.fadeNode.gain.linearRampToValueAtTime(1, this.context.currentTime + duration)
    await sleep(duration * 1000)
  }

  private async fadeOut(duration = 0) {
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
      console.warn('replayGainFactor(): invalid ReplayGain settings', this.replayGain)
      return 1.0
    }

    const preAmp = 6.0
    const gainFactor = Math.pow(10, (gain + preAmp) / 20)
    const peakFactor = 1 / peak
    const factor = Math.min(gainFactor, peakFactor)
    console.info('replayGainFactor():', factor)
    return factor
  }
}

function creatPipeline(
  context: AudioContext,
  options: { audio?: HTMLAudioElement; volume?: number; replayGain?: number }
) {
  let audio: HTMLAudioElement

  if (options.audio) {
    audio = options.audio
  } else {
    audio = new Audio()
  }

  audio.playbackRate = 1.0

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
    audio.src = ''
    try {
      audio.load()
    } catch {}
  }

  return { audio, volumeNode, replayGainNode, fadeNode, normalizerNode, disconnect }
}

function endPlayback(context: AudioContext, pipeline: ReturnType<typeof creatPipeline>) {
  console.info('endPlayback(): ending payback')
  pipeline.audio.ontimeupdate = null
  pipeline.audio.ondurationchange = null
  pipeline.audio.onpause = null
  pipeline.audio.onerror = null
  pipeline.audio.onended = null
  pipeline.audio.onloadedmetadata = null

  // const startTime = Date.now()
  setTimeout(() => {
    // console.info(`AudioController: ending payback done. actual ${Date.now() - startTime}ms`)
    pipeline.disconnect()
  }, 1000)
}
