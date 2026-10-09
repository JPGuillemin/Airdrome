// Player.vue
<template>
  <div
    class="player"
    :class="{ visible: track }"
  >
    <!-- visual layer (background + radius ONLY) -->
    <div class="player-shape">
      <!-- layout layer (NO clipping) -->
      <div class="player-content d-flex">
        <div class="flex-fill">

          <!-- progress -->
          <div
            class="slider-click-zone"
            @mouseenter="focusSlider"
            @mouseleave="blurSlider"
            @click="onSliderClick($event)"
          >
            <Slider
              ref="progressSlider"
              v-model="sliderValue"
              :min="0"
              :max="playerStore.duration"
              :step="0.1"
              :tooltips="true"
              tooltip-position="bottom"
              show-tooltip="focus"
              :format="formatter"
              orientation="horizontal"
              :lazy="true"
              class="playback-slider real-slider mx-2"
              @start="onSliderDragStart"
              @end="onSliderDragEnd"
              @change="onSliderUpdate"
            />
          </div>

          <!-- main row -->
          <div class="player-row elevated">

            <!-- track info -->
            <div class="track-col">
              <template v-if="track">
                <div
                  v-if="track.albumId"
                  ref="coverEl"
                  style="cursor: pointer"
                  @click.stop="onCoverClick"
                  @mouseenter="showPreview"
                  @mouseleave="hidePreview"
                  @touchstart.passive="onTouchStart"
                  @touchmove.passive="onTouchMove"
                  @touchend="onTouchEnd"
                  @touchcancel="onTouchCancel"
                  @contextmenu="onContextMenu"
                >
                  <img
                    v-if="track.image"
                    :src="track.image"
                    class="player-cover"
                  >
                  <img
                    v-else
                    src="@/shared/assets/fallback.svg"
                    class="player-cover"
                  >
                </div>

                <div style="min-width:0; flex:1;">
                  <div class="player-text-wrap">
                    <template v-if="track.artists.length">
                      <router-link
                        @click.stop
                        :to="{ name: 'artist', params: { id: track.artists[0].id } }"
                        class="player-link"
                      >
                        {{ track.artists[0].name }}
                      </router-link>

                      <span class="text-muted"> • </span>

                      <router-link
                        @click.stop
                        :to="{ name: 'album', params: { id: track.albumId } }"
                        class="player-link"
                      >
                        {{ track.title }}
                      </router-link>
                    </template>

                    <template v-else>
                      {{ track.title }}
                    </template>
                  </div>
                </div>
              </template>
            </div>

            <!-- play control -->
            <div class="play-controls">
              <b-button
                variant="transparent"
                class="btn-skip d-none d-md-inline-flex"
                @click.stop="back"
              >
                <Icon icon="skip-start" />
              </b-button>

              <b-button
                variant="transparent"
                class="btn-play"
                @click.stop="playPause"
              >
                <Icon :icon="isPlaying ? 'pause' : 'play'" />
              </b-button>

              <b-button
                variant="transparent"
                class="btn-skip"
                @click.stop="next"
              >
                <Icon icon="skip-end" />
              </b-button>
            </div>

            <!-- right controls -->
            <div class="right-controls">
              <div class="d-flex flex-nowrap justify-content-end pe-3">

                <div class="ms-2 d-none d-md-inline-flex align-items-center">
                  <b-button
                    title="Like"
                    variant="transparent"
                    class="m-0"
                    @click.stop="toggleFavourite"
                  >
                    <Icon :icon="isFavourite ? 'heart-fill' : 'heart'" />
                  </b-button>

                  <b-button
                    v-if="track && track.replayGain"
                    title="R.Gain"
                    variant="transparent"
                    class="m-0"
                    :class="{ 'theme-primary': replayGainMode !== ReplayGainMode.None }"
                    @click.stop="toggleReplayGain"
                  >
                    <IconReplayGain v-if="replayGainMode === ReplayGainMode.None" />
                    <Icon icon="music-note" color="var(--bs-primary)" v-else-if="replayGainMode === ReplayGainMode.Track" />
                    <Icon icon="music-notes-beamed" color="var(--bs-primary)" v-else />
                  </b-button>
                </div>

                <!-- overflow menu MUST NOT be clipped -->
                <OverflowMenu direction="up">
                  <div class="px-3 py-1 on-top">
                    <Slider
                      v-model="playerStore.volume"
                      orientation="vertical"
                      direction="rtl"
                      :min="0"
                      :max="1"
                      :step="0.01"
                      :tooltips="false"
                      class="volume-slider"
                      @update="playerStore.setVolume"
                    />
                  </div>

                  <div class="px-3 py-1 on-top">
                    <b-button
                      title="Repeat"
                      variant="transparent"
                      class="m-0 px-2 py-0"
                      :class="{ 'theme-primary': repeatActive }"
                      @click.stop="toggleRepeat"
                    >
                      <Icon icon="repeat" />
                    </b-button>
                  </div>

                  <div class="d-md-none px-3 py-1 on-top">
                    <b-button
                      variant="transparent"
                      class="m-0 px-2 py-0"
                      @click.stop="toggleFavourite"
                    >
                      <Icon :icon="isFavourite ? 'heart-fill' : 'heart'" />
                    </b-button>
                  </div>

                  <div v-if="track && track.replayGain" class="d-md-none px-3 py-1 on-top">
                    <b-button
                      title="ReplayGain"
                      variant="transparent"
                      class="m-0 px-2 py-0"
                      :class="{ 'theme-primary': replayGainMode !== ReplayGainMode.None }"
                      @click.stop="toggleReplayGain"
                    >
                      <IconReplayGain v-if="replayGainMode === ReplayGainMode.None" />
                      <Icon icon="music-note" color="var(--bs-primary)" v-else-if="replayGainMode === ReplayGainMode.Track" />
                      <Icon icon="music-notes-beamed" color="var(--bs-primary)" v-else />
                    </b-button>
                  </div>
                  <div class="d-md-none px-3 py-1 on-top">
                    <b-button
                      variant="transparent"
                      @click.stop="back"
                    >
                      <Icon icon="skip-start" />
                    </b-button>
                  </div>
                </OverflowMenu>

              </div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <!-- album cover preview (teleported so it is never clipped by the player) -->
    <Teleport to="body">
      <Transition name="cover-preview">
        <img
          v-if="previewVisible && track?.image"
          :src="track.image"
          :style="previewStyle"
          class="cover-preview"
          alt=""
        >
      </Transition>
    </Teleport>
  </div>
</template>

<script lang="ts">
  import { defineComponent, watch, ref, computed, onBeforeUnmount } from 'vue'
  import { ReplayGainMode } from './audio'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlayerStore } from '@/player/store'
  import IconReplayGain from '@/shared/components/IconReplayGain.vue'
  import IconReplayGainTrack from '@/shared/components/IconReplayGainTrack.vue'
  import IconReplayGainAlbum from '@/shared/components/IconReplayGainAlbum.vue'
  import Slider from '@vueform/slider'
  import '@vueform/slider/themes/default.css'
  import { formatDuration } from '@/shared/utils'
  import { useRouter, useRoute } from 'vue-router'

  export default defineComponent({
    name: 'Player',
    components: {
      IconReplayGain,
      IconReplayGainTrack,
      IconReplayGainAlbum,
      Slider,
    },
    setup() {
      const router = useRouter()
      const route = useRoute()
      const playerStore = usePlayerStore()
      const favouriteStore = useFavouriteStore()

      const progressSlider = ref<any>(null)
      const sliderValue = ref(0)
      const dragging = ref(false)
      const tooltipTimer = ref<number | null>(null)

      watch(
        () => playerStore.currentTime,
        (current) => {
          if (!dragging.value) {
            sliderValue.value = current
          }
        },
        { immediate: true }
      )

      const track = computed(() => playerStore.track)
      const isPlaying = computed(() => playerStore.isPlaying)
      const isMuted = computed(() => playerStore.volume <= 0)
      const repeatActive = computed(() => playerStore.repeat)
      const replayGainMode = computed<ReplayGainMode>(() => playerStore.replayGainMode)
      const isMobile = matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0

      // Album cover hover preview
      const coverEl = ref<HTMLElement | null>(null)
      const previewVisible = ref(false)
      const previewStyle = ref<Record<string, string>>({})

      const PREVIEW_SIZE = 250
      const PREVIEW_MARGIN = 8

      const PREVIEW_DELAY = 1500 // ms
      let previewTimer: number | null = null

      const clearPreviewTimer = () => {
        if (previewTimer) {
          clearTimeout(previewTimer)
          previewTimer = null
        }
      }

      const showPreview = () => {
        if (isMobile) return
        clearPreviewTimer()
        previewTimer = window.setTimeout(openPreview, PREVIEW_DELAY)
      }

      const openPreview = () => {
        previewTimer = null
        if (!track.value?.image || !coverEl.value) return

        const rect = coverEl.value.getBoundingClientRect()

        // 500x500, shrunk only if the viewport is too small
        const size = Math.min(
          PREVIEW_SIZE,
          window.innerWidth - PREVIEW_MARGIN * 2,
          rect.top - PREVIEW_MARGIN * 2,
        )

        // above the cover, left-aligned, kept inside the viewport
        const left = Math.min(
          Math.max(rect.left, PREVIEW_MARGIN),
          window.innerWidth - size - PREVIEW_MARGIN,
        )
        const top = rect.top - size - PREVIEW_MARGIN

        previewStyle.value = {
          width: `${size}px`,
          height: `${size}px`,
          left: `${left}px`,
          top: `${top}px`,
        }
        previewVisible.value = true
      }

      const hidePreview = () => {
        clearPreviewTimer()
        previewVisible.value = false
      }

      // Long press (touch devices: Capacitor / PWA)
      const LONG_PRESS_DELAY = 500 // ms
      const MOVE_TOLERANCE = 10 // px before the press is considered a scroll/drag
      let longPressTimer: number | null = null
      let longPressFired = false
      let touchActive = false
      let touchOrigin = { x: 0, y: 0 }

      const clearLongPressTimer = () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer)
          longPressTimer = null
        }
      }

      const onTouchStart = (e: TouchEvent) => {
        const t = e.touches[0]
        if (!t) return
        touchActive = true
        longPressFired = false
        touchOrigin = { x: t.clientX, y: t.clientY }
        clearLongPressTimer()
        longPressTimer = window.setTimeout(() => {
          longPressTimer = null
          longPressFired = true
          openPreview()
        }, LONG_PRESS_DELAY)
      }

      const onTouchMove = (e: TouchEvent) => {
        if (!longPressTimer) return
        const t = e.touches[0]
        if (!t) return
        if (Math.hypot(t.clientX - touchOrigin.x, t.clientY - touchOrigin.y) > MOVE_TOLERANCE) {
          clearLongPressTimer()
        }
      }

      const onTouchEnd = (e: TouchEvent) => {
        touchActive = false
        clearLongPressTimer()
        if (longPressFired) {
          e.preventDefault() // no synthesized click -> no album navigation
          hidePreview()
        }
      }

      const onTouchCancel = () => {
        touchActive = false
        clearLongPressTimer()
        hidePreview()
      }

      // Block the native image/context menu while a touch press is in progress
      const onContextMenu = (e: Event) => {
        if (touchActive || longPressFired) e.preventDefault()
      }

      const onCoverClick = () => {
        if (longPressFired) {
          longPressFired = false
          return
        }
        onAlbumClick()
      }

      const isFavourite = computed<boolean>(() => {
        return !!track.value && favouriteStore.get('track', track.value.id)
      })

      const documentTitle = computed<string>(() => {
        return [
          track.value?.title,
          track.value?.artists?.map(a => a.name).join(', ') || track.value?.album,
          'Airdrome',
        ]
          .filter(Boolean)
          .join(' • ')
      })

      const showProgressTooltip = () => {
        const root = progressSlider.value?.$el
        if (!root) return

        const handle =
          root.querySelector('.slider-handle') ||
          root.querySelector('[tabindex]')

        if (!handle) return

        ;(handle as HTMLElement).focus()

        if (tooltipTimer.value) {
          clearTimeout(tooltipTimer.value)
        }

        tooltipTimer.value = window.setTimeout(() => {
          ;(handle as HTMLElement).blur()
        }, 5000)
      }

      watch(
        documentTitle,
        (value) => {
          document.title = value
        },
        { immediate: true }
      )

      const onAlbumClick = () => {
        const t = playerStore.track
        if (!t?.albumId) return

        if (route.name === 'album' && String(route.params.id) === String(t.albumId)) {
          router.back()
        } else {
          router.push({ name: 'album', params: { id: t.albumId } })
        }
      }

      const focusSlider = () => {
        const el = progressSlider.value?.$el?.querySelector('[tabindex]')
        el?.focus()
      }

      const blurSlider = () => {
        const el = progressSlider.value?.$el?.querySelector('[tabindex]')
        el?.blur()
      }

      const onSliderDragStart = () => {
        dragging.value = true
        showProgressTooltip()
      }

      const onSliderDragEnd = () => {
        dragging.value = false
      }

      // The Slider's own @change and the click-zone @click both fire for the same
      // gesture; without this guard the track is seeked twice (two fade dips).
      let lastSeekAt = 0

      const onSliderUpdate = (value: number) => {
        lastSeekAt = Date.now()
        playerStore.seek(value)
        dragging.value = false
      }

      const formatter = (value: number) => {
        return `${formatDuration(value)} / ${formatDuration(playerStore.duration)}`
      }

      const onSliderClick = (e: MouseEvent) => {
        if (Date.now() - lastSeekAt < 500) return // already handled by the Slider
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const x = e.clientX - rect.left
        const ratio = x / rect.width
        const newTime = ratio * playerStore.duration
        playerStore.seek(newTime)
        showProgressTooltip()
      }

      function playPause() { playerStore.playPause() }
      function next() { playerStore.next(true) }
      function back() { playerStore.back() }
      function toggleReplayGain() { playerStore.toggleReplayGain() }
      function toggleRepeat() { playerStore.toggleRepeat() }
      function toggleFavourite() {
        if (track.value) {
          favouriteStore.toggle('track', track.value.id)
        }
      }

      onBeforeUnmount(() => {
        if (tooltipTimer.value) clearTimeout(tooltipTimer.value)
        clearPreviewTimer()
        clearLongPressTimer()
      })

      return {
        ReplayGainMode,
        favouriteStore,
        playerStore,
        sliderValue,
        dragging,
        track,
        isPlaying,
        isMuted,
        repeatActive,
        replayGainMode,
        isFavourite,
        progressSlider,
        coverEl,
        previewVisible,
        previewStyle,
        showPreview,
        hidePreview,
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        onTouchCancel,
        onContextMenu,
        onCoverClick,
        focusSlider,
        blurSlider,
        onAlbumClick,
        onSliderDragStart,
        onSliderDragEnd,
        onSliderUpdate,
        onSliderClick,
        formatter,
        playPause,
        next,
        back,
        toggleReplayGain,
        toggleRepeat,
        toggleFavourite,
      }
    },
  })
</script>

<style scoped>
  .player {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    height: 0;
    max-height: 0;
    transition: max-height 0.5s;
    background: var(--theme-elevation-0);
  }

  .player.visible {
    height: auto;
    max-height: 115px;
  }

  /* Main layout */
  .player-row {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 58px;
    padding: 0;
  }

  /* Track area grows */
  .track-col {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .track-col > div:last-child {
    flex: 1;
    min-width: 0;
  }

  /* Transport */
  .play-controls {
    flex: 0 0 auto;
    height: 58px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Right side controls */
  .right-controls {
    flex: 0 0 auto;
    height: 58px;
    display: flex;
    align-items: center;
    margin-left: auto;
  }

  .right-controls > div {
    height: 100%;
    display: flex;
    align-items: center;
  }

  /* Cover */
  .player-cover {
    display: block;
    width: 56px;
    height: 56px;
    object-fit: cover;
    border-radius: 5px;
    flex-shrink: 0;
    margin: 10px;
    /* keep long press from opening the native image menu / selection */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-user-drag: none;
  }

  /* Cover hover preview (teleported to body) */
  .cover-preview {
    position: fixed;
    z-index: 2000; /* above .player (1000) */
    object-fit: cover;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
    pointer-events: none; /* prevents hover flicker */
  }

  .cover-preview-enter-active,
  .cover-preview-leave-active {
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  .cover-preview-enter-from,
  .cover-preview-leave-to {
    opacity: 0;
    transform: translateY(6px) scale(0.97);
  }

  /* Buttons */
  .player .btn {
    --bs-btn-font-size: 1.3rem;
    color: var(--theme-text);

    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .player .btn-play {
    --bs-btn-font-size: 2rem;
    padding: 0.2rem;
  }

  .player .btn-skip {
    --bs-btn-font-size: 1.2rem;
  }

  .player .btn:hover {
    color: var(--bs-primary);
  }

  .player .btn:active {
    color: var(--bs-primary);
  }

  /* Player background */
  .player-shape {
    margin: 5px;
    background: var(--theme-elevation-1);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    overflow: hidden;
  }

  /* Progress slider */
  .slider-click-zone {
    position: relative;
    padding-top: 10px;
    padding-bottom: 5px;
    cursor: pointer;
    background: transparent !important;
  }

  .slider-click-zone .real-slider {
    pointer-events: none;
  }

  .slider-click-zone .real-slider * {
    pointer-events: auto;
  }

  .playback-slider {
    --slider-connect-bg: var(--bs-primary);
    --slider-bg: var(--theme-elevation-2);
    --slider-handle-bg: var(--bs-primary);
    --slider-tooltip-bg: var(--bs-primary);
    --slider-handle-ring-color: transparent;
    margin: auto;
    background: transparent;
  }

  .playback-slider:hover {
    --slider-handle-bg: var(--bs-primary);
  }

  .playback-slider *:focus {
    outline: none !important;
    caret-color: transparent !important;
  }

  /* Volume */
  .volume-slider {
    --slider-connect-bg: var(--bs-primary);
    --slider-bg: var(--theme-elevation-2);
    --slider-handle-bg: var(--bs-primary);
    --slider-handle-ring-color: transparent;
    width: 4px !important;
    height: 120px !important;
    margin: auto;
  }

  .player-text-wrap {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: normal;
    word-break: break-word;
    line-height: 1.25em;
    max-height: 2.5em; /* 1.25em * 2 lines */
  }

  .player-link {
    color: var(--theme-text);
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .player-link:hover {
    color: var(--bs-primary);
  }

  .play-controls,
  .right-controls {
    align-items: center;
  }

  /* Mobile */
  @media(max-width:768px) {

    .player {
      font-size: 0.8rem;
      bottom: var(--mobile-nav-height);
    }

    .player.visible {
      max-height: 110px;
    }

    .player-row {
      min-height: 55px;
    }

    .play-controls,
    .right-controls {
      height: 55px;
    }

    .player .btn-skip {
      --bs-btn-font-size: 1rem;
    }

    .player .btn:hover {
      color: var(--theme-text);
    }

    .player .btn:active {
      color: var(--bs-primary);
    }

    .right-controls {
      padding-right: 2px;
    }
  }
</style>
