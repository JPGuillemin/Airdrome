import { sleep } from '@/shared/utils'
import { useCacheStore } from '@/player/cache'

export enum ReplayGainMode {
  None,
  Track,
  Album,
  _Length
}

type ReplayGain = {
  trackGain: number
  trackPeak: number
  albumGain: number
  albumPeak: number
}

type AudioPipeline = {
  audio: HTMLAudioElement
  volumeNode: GainNode
  replayGainNode: GainNode
  fadeNode: GainNode
  normalizerNode: DynamicsCompressorNode
  dispose(): void
}

export class AudioController {
  private fadeTime = 0.3
  private changeToken = 0
  private buffer: HTMLAudioElement | null = null
  private replayGainMode = ReplayGainMode.None
  private replayGain: ReplayGain | null = null
  private cachingQueue: Promise<void> = Promise.resolve()

  private context = new AudioContext()
  private pipeline: AudioPipeline = createPipeline(this.context, {})

  ontimeupdate = (_: number) => {}
  ondurationchange = (_: number) => {}
  onpause = () => {}
  onplay = () => {}
  onended = () => {}
  onerror = (_: MediaError | null) => {}
  onfocus = () => {}
  onblur = () => {}
  onvisibilitychange = () => {}

  get audioElement(): HTMLAudioElement | undefined {
    return this.pipeline.audio
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
    this.buffer = new Audio()
    this.buffer.crossOrigin = 'anonymous'
    this.buffer.preload = 'auto'
    this.buffer.src = url
    try { this.buffer.load() } catch {}
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
      this.pipeline.normalizerNode.ratio.value = 1
    } else {
      this.pipeline.normalizerNode.threshold.value = -3
      this.pipeline.normalizerNode.knee.value = 3
      this.pipeline.normalizerNode.ratio.value = 2
      this.pipeline.normalizerNode.attack.value = 0.01
      this.pipeline.normalizerNode.release.value = 0.1
    }
  }

  async stop() {
    this.changeToken++
    this.disposePipeline(this.pipeline)
  }

  async pause() {
    await this.fadeOut(this.fadeTime)
    this.pipeline.audio.pause()
  }

  async play() {
    if (this.context.state === 'suspended') {
      await this.context.resume()
    }
    await this.pipeline.audio.play()
    await this.fadeIn(this.fadeTime / 2)
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

  async loadTrack(options: {
    url?: string
    nextUrl?: string
    paused?: boolean
    replayGain?: ReplayGain
    fade?: boolean
  }) {
    if (!options.url) return

    const token = ++this.changeToken
    this.replayGain = options.replayGain ?? null

    if (!this.buffer || this.buffer.src !== options.url) {
      this.setBuffer(options.url)
    }

    const nextPipeline = createPipeline(this.context, {
      audio: this.buffer!,
      volume: this.pipeline.volumeNode.gain.value,
      replayGain: this.replayGainFactor()
    })

    if (token !== this.changeToken) {
      nextPipeline.dispose()
      return
    }

    if (options.fade) {
      await this.fadeOut(this.fadeTime)
    }

    this.replacePipeline(nextPipeline)
    this.setReplayGainMode(this.replayGainMode)

    const audio = this.pipeline.audio

    audio.onerror = () => this.onerror(audio.error)
    audio.onended = () => this.onended()
    audio.onpause = () => this.onpause()
    audio.onplay = () => this.onplay()
    audio.ontimeupdate = () => this.ontimeupdate(audio.currentTime)

    audio.addEventListener('loadedmetadata', () => {
      const d = audio.duration
      if (Number.isFinite(d) && d > 0) {
        this.ondurationchange(d)
      }
    })

    if (audio.readyState < 1) {
      try { audio.load() } catch {}
    }

    if (!options.paused) {
      try {
        await this.play()
      } catch (err: any) {
        if (err.name !== 'AbortError') throw err
      }
    }

    if (options.nextUrl) {
      this.setBuffer(options.nextUrl)
    }
  }

  private replacePipeline(next: AudioPipeline) {
    this.disposePipeline(this.pipeline)
    this.pipeline = next
  }

  private disposePipeline(pipeline: AudioPipeline) {
    pipeline.audio.onended = null
    pipeline.audio.onerror = null
    pipeline.audio.onpause = null
    pipeline.audio.onplay = null
    pipeline.audio.ontimeupdate = null
    pipeline.audio.ondurationchange = null

    setTimeout(() => pipeline.dispose(), 500)
  }

  private async fadeIn(duration = 0) {
    const g = this.pipeline.fadeNode.gain
    g.cancelScheduledValues(0)
    g.setValueAtTime(g.value, this.context.currentTime)
    g.linearRampToValueAtTime(1, this.context.currentTime + duration)
    await sleep(duration * 1000)
  }

  private async fadeOut(duration = 0) {
    const g = this.pipeline.fadeNode.gain
    g.cancelScheduledValues(0)
    g.setValueAtTime(g.value, this.context.currentTime)
    g.linearRampToValueAtTime(0, this.context.currentTime + duration)
    await sleep(duration * 1000)
  }

  private replayGainFactor(): number {
    if (this.replayGainMode === ReplayGainMode.None || !this.replayGain) {
      return 1
    }

    const gain =
      this.replayGainMode === ReplayGainMode.Track
        ? this.replayGain.trackGain
        : this.replayGain.albumGain

    const peak =
      this.replayGainMode === ReplayGainMode.Track
        ? this.replayGain.trackPeak
        : this.replayGain.albumPeak

    if (!Number.isFinite(gain) || !Number.isFinite(peak) || peak <= 0) {
      return 1
    }

    const preAmp = 6
    return Math.min(
      Math.pow(10, (gain + preAmp) / 20),
      1 / peak
    )
  }
}

function createPipeline(
  context: AudioContext,
  {
    audio = new Audio(),
    volume = 1,
    replayGain = 1
  }: {
    audio?: HTMLAudioElement
    volume?: number
    replayGain?: number
  }
): AudioPipeline {
  audio.playbackRate = 1

  const source = context.createMediaElementSource(audio)
  const volumeNode = context.createGain()
  const replayGainNode = context.createGain()
  const fadeNode = context.createGain()
  const normalizerNode = context.createDynamicsCompressor()

  volumeNode.gain.value = volume
  replayGainNode.gain.value = replayGain
  fadeNode.gain.value = 1
  normalizerNode.threshold.value = 0

  source
    .connect(volumeNode)
    .connect(replayGainNode)
    .connect(fadeNode)
    .connect(normalizerNode)
    .connect(context.destination)

  function dispose() {
    audio.pause()
    source.disconnect()
    volumeNode.disconnect()
    replayGainNode.disconnect()
    fadeNode.disconnect()
    normalizerNode.disconnect()
    audio.src = ''
    try { audio.load() } catch {}
  }

  return {
    audio,
    volumeNode,
    replayGainNode,
    fadeNode,
    normalizerNode,
    dispose
  }
}
