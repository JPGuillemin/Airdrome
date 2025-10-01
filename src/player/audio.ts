import IcecastMetadataStats from 'icecast-metadata-stats'
import { sleep } from '@/shared/utils'

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
  private changeToken = 0
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
  onfocus: () => void = () => { /* do nothing */ }
  onblur: () => void = () => { /* do nothing */ }
  onvisibilitychange: () => void = () => { /* do nothing */ }

  constructor() {
    // Adding event listeners for focus and visibility
    window.addEventListener('focus', this.handleFocus.bind(this))
    window.addEventListener('blur', this.handleBlur.bind(this))
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this))
  }

  private handleFocus() {
    console.log('AudioController: got focus')
    this.onfocus()
  }

  private handleBlur() {
    console.log('AudioController: lost focus')
    this.onblur()
  }

  private handleVisibilityChange() {
    if (document.hidden) {
      console.log('AudioController: hidden')
    } else {
      console.log('AudioController: visible')
    }
    this.onvisibilitychange()
  }

  currentTime() {
    return this.pipeline.audio.currentTime
  }

  duration() {
    return this.pipeline.audio.duration
  }

  async setBuffer(url: string) {
    this.buffer = null
    this.buffer = new Audio(url)
    this.buffer.crossOrigin = 'anonymous'
    this.buffer.preload = 'auto'
    try { this.buffer.load() } catch { /* ignore */ }
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
    await this.fadeOut(0.4)
    this.pipeline.audio.pause()
  }

  async resume() {
    await this.context.resume()
    try {
      this.pipeline.audio.play()
      await this.fadeIn(0.4)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn('Resume aborted')
        return
      }
      throw err
    }
  }

  async play() {
    try {
      this.pipeline.audio.play()
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn('Play aborted')
        return
      }
      throw err
    }
  }

  async seek(value: number) {
    if (!this.pipeline.audio.paused) {
      await this.fadeOut(0.2)
    }
    this.pipeline.audio.currentTime = value
    if (!this.pipeline.audio.paused) {
      await this.fadeIn(0.2)
    }
  }

  async changeTrack(options: { url?: string, paused?: boolean, replayGain?: ReplayGain, isStream?: boolean, playbackRate?: number }) {
    const token = ++this.changeToken
    let pipeline: ReturnType<typeof creatPipeline> | undefined

    if (this.pipeline.audio) {
      endPlayback(this.context, this.pipeline)
    }
    this.replayGain = options.replayGain || null

    if (this.buffer && this.buffer.src === options.url) {
      console.info('AudioController: using buffer for ', options.url)
      pipeline = creatPipeline(this.context, {
        audio: this.buffer,
        volume: this.pipeline.volumeNode.gain.value,
        replayGain: this.replayGainFactor(),
      })
    } else {
      console.info('AudioController: no buffer, fetching ', options.url)
      pipeline = creatPipeline(this.context, {
        url: options.url,
        volume: this.pipeline.volumeNode.gain.value,
        replayGain: this.replayGainFactor(),
      })
    }
    if (token === this.changeToken) {
      this.pipeline.disconnect()
      this.pipeline = pipeline!
      this.startTrack(this.pipeline, options.url, options.paused)
      this.SetIcecast(options.url, options.isStream, options.playbackRate)
      await this.fadeIn(0.2)
    } else {
      pipeline!.disconnect()
    }
  }

  private async startTrack(pipeline: ReturnType<typeof creatPipeline>, url?: string, paused?: boolean) {
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
        this.pipeline.audio.play()
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.warn('Audio play aborted due to rapid skip')
          return
        }
        throw error
      }
    }
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
    audio.src = ''
    try { audio.load() } catch {}
  }

  return { audio, volumeNode, replayGainNode, fadeNode, normalizerNode, disconnect }
}

function endPlayback(context: AudioContext, pipeline: ReturnType<typeof creatPipeline>) {
  // console.info(`AudioController: ending payback for ${pipeline.audio}`)
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
  }, 400)
}
