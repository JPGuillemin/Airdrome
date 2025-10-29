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
  private fadeTime = 0.3
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
    try {
      const cache = await caches.open('airdrome-cache-v2')
      const existing = await cache.match(url)
      if (!existing) {
        console.info('setCache(): caching in background', url)
        const response = await fetch(url, { mode: 'cors', cache: 'force-cache' })
        if (response.ok) {
          await cache.put(url, response.clone())
          const cacheFinishedEvent = new CustomEvent('audioCached', { detail: url })
          window.dispatchEvent(cacheFinishedEvent)
        } else {
          console.warn('setCache(): fetch failed, not caching', url)
        }
      } else {
        console.info('setCache(): already cached', url)
      }
    } catch (err) {
      console.warn('setCache(): cache failed', url, err)
    }
  }

  async setBuffer(url: string, sleeptime = 0) {
    if (sleeptime > 0) await sleep(sleeptime)
    this.buffer = null
    this.buffer = new Audio()
    this.buffer.crossOrigin = 'anonymous'
    this.buffer.preload = 'auto'
    this.buffer.src = url // start streaming immediately

    this.setCache(url)

    try { this.buffer.load() } catch { /* ignore */ }
  }

  async clearCache() {
    try {
      const success = await caches.delete('airdrome-cache-v2')
      if (success) {
        console.info('clearCache(): All cached audio files deleted.')
        const cacheClearedEvent = new CustomEvent('audioCacheCleared')
        window.dispatchEvent(cacheClearedEvent)
      } else {
        console.warn('clearCache(): No cache found or failed to delete.')
      }
    } catch (err) {
      console.error('clearCache(): Error clearing cache:', err)
    }
  }

  async deleteCacheEntry(url: string) {
    try {
      const cache = await caches.open('airdrome-cache-v2')
      const deleted = await cache.delete(url)
      if (deleted) {
        console.info('deleteCacheEntry(): Cache entry deleted for', url)
        const cacheDeletedEvent = new CustomEvent('audioCacheDeleted', { detail: url })
        window.dispatchEvent(cacheDeletedEvent)
      } else {
        console.warn('deleteCacheEntry(): No matching cache entry found for', url)
      }
    } catch (err) {
      console.error('deleteCacheEntry(): Error deleting cache entry:', err)
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
    console.info('setReplayGainMode():', this.replayGainFactor())
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
    let pipeline: ReturnType<typeof creatPipeline> | undefined
    let buffered = false
    if (this.pipeline.audio) {
      endPlayback(this.context, this.pipeline)
    }

    this.replayGain = options.replayGain || null

    if (this.buffer && this.buffer.src === options.url) {
      buffered = true
      console.info('loadTrack(): Using pre-buffer for ', options.url)
      pipeline = creatPipeline(this.context, {
        audio: this.buffer,
        volume: this.pipeline.volumeNode.gain.value,
        replayGain: this.replayGainFactor(),
      })
    } else {
      console.info('loadTrack(): Fetching cache or server for ', options.url)
      this.setCache(options.url!)
      pipeline = creatPipeline(this.context, {
        url: options.url,
        volume: this.pipeline.volumeNode.gain.value,
        replayGain: this.replayGainFactor(),
      })
    }

    if (token === this.changeToken) {
      this.pipeline.disconnect()
      this.pipeline = pipeline!
      this.setReplayGainMode(this.replayGainMode)

      const audio = pipeline.audio

      audio.onerror = () => this.onerror(audio.error)
      audio.onended = () => this.onended()
      audio.ontimeupdate = () => this.ontimeupdate(audio.currentTime)
      audio.onpause = () => this.onpause()

      this.setupDurationListener(pipeline.audio)

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
        if (buffered) {
          this.setBuffer(options.nextUrl, 0)
        } else {
          this.setBuffer(options.nextUrl, 10000)
        }
        console.info('loadTrack(): buffering ', options.nextUrl)
      }
    } else {
      pipeline!.disconnect()
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
  options: { url?: string; audio?: HTMLAudioElement; volume?: number; replayGain?: number }
) {
  let audio: HTMLAudioElement

  if (options.audio) {
    audio = options.audio
  } else if (options.url) {
    audio = new Audio()
    audio.crossOrigin = 'anonymous'
    audio.preload = 'auto'
    audio.src = options.url! // start streaming immediately
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
