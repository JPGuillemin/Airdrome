// Player.vue
<template>
  <div
    class="player"
    :class="{ visible: track }"
  >
    <!-- visual layer (background + radius ONLY) -->
    <div
      class="player-shape"
      @contextmenu.prevent="onInfoContextMenu"
      @mousedown="onInfoMouseDown"
      @mousemove="onInfoMouseMove"
      @mouseup="onInfoMouseUp"
      @mouseleave="onInfoMouseUp"
      @touchstart.passive="onInfoTouchStart"
      @touchmove.passive="onInfoTouchMove"
      @touchend="onInfoTouchEnd"
      @touchcancel="onInfoTouchEnd"
      @click.capture="onInfoClickCapture"
    >
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
              class="playback-slider real-slider"
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
                v-longpress-tooltip
                variant="transparent"
                class="btn-skip d-none d-md-inline-flex"
                title="Previous track"
                @click.stop="back"
              >
                <Icon icon="skip-start" />
              </b-button>

              <b-button
                v-longpress-tooltip
                variant="transparent"
                class="btn-play"
                :title="playTitle"
                @click.stop="playPause"
              >
                <Icon :icon="playIcon" />
              </b-button>

              <b-button
                v-longpress-tooltip
                variant="transparent"
                class="btn-skip"
                title="Next track"
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
                    v-longpress-tooltip
                    title="Like"
                    variant="transparent"
                    class="m-0"
                    @click.stop="toggleFavourite"
                  >
                    <Icon :icon="favouriteIcon" />
                  </b-button>

                  <b-button
                    v-longpress-tooltip
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
                  <div class="d-flex justify-content-center px-3 py-1 on-top">
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

                  <div class="d-flex justify-content-center px-3 py-1 on-top">
                    <b-button
                      v-longpress-tooltip
                      title="Repeat"
                      variant="transparent"
                      class="m-0 px-2 py-0"
                      :class="{ 'theme-primary': repeatActive }"
                      @click.stop="toggleRepeat"
                    >
                      <Icon icon="repeat" />
                    </b-button>
                  </div>

                  <div class="d-flex justify-content-center d-md-none px-3 py-1 on-top">
                    <b-button
                      v-longpress-tooltip
                      variant="transparent"
                      class="m-0 px-2 py-0"
                      title="Like"
                      @click.stop="toggleFavourite"
                    >
                      <Icon :icon="favouriteIcon" />
                    </b-button>
                  </div>

                  <div v-if="track && track.replayGain" class="d-flex justify-content-center d-md-none px-3 py-1 on-top">
                    <b-button
                      v-longpress-tooltip
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
                  <div class="d-flex justify-content-center d-md-none px-3 py-1 on-top">
                    <b-button
                      v-longpress-tooltip
                      variant="transparent"
                      title="Previous track"
                      @click.stop="back"
                    >
                      <Icon icon="skip-start" />
                    </b-button>
                  </div>

                  <hr class="dropdown-divider">
                  <div class="d-flex justify-content-center px-3 py-1 on-top">
                    <b-button
                      v-longpress-tooltip
                      title="Track Info"
                      variant="transparent"
                      class="m-0 px-2 py-0"
                      @click="openInfo"
                    >
                      <Icon icon="info" />
                    </b-button>
                  </div>
                </OverflowMenu>

              </div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <TrackInfoDialog
        :visible="infoVisible"
        :track="track"
        @close="infoVisible = false"
      />
    </Teleport>

    <!-- album cover preview (teleported so it is never clipped by the player) -->
    <Teleport to="body">
      <Transition name="cover-preview">
        <img
          v-if="previewVisible && track && track.image"
          :src="track.image"
          :style="previewStyle"
          class="cover-preview"
          alt=""
        >
      </Transition>
    </Teleport>
  </div>
</template>

<script>
  import { defineComponent, watch, ref, computed, onBeforeUnmount } from 'vue'
  import { ReplayGainMode } from './audio'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlayerStore } from '@/player/store'
  import IconReplayGain from '@/shared/components/IconReplayGain.vue'
  import Slider from '@vueform/slider'
  import '@vueform/slider/themes/default.css'
  import { formatDuration } from '@/shared/utils'
  import { useRouter, useRoute } from 'vue-router'
  import TrackInfoDialog from '@/player/TrackInfoDialog.vue'

  export default defineComponent({
    name: 'Player',
    components: {
      IconReplayGain: IconReplayGain,
      Slider: Slider,
      TrackInfoDialog: TrackInfoDialog,
    },
    setup: function () {
      var router = useRouter()
      var route = useRoute()
      var playerStore = usePlayerStore()
      var favouriteStore = useFavouriteStore()

      var progressSlider = ref(null)
      var sliderValue = ref(0)
      var dragging = ref(false)
      var tooltipTimer = ref(null)

      var infoVisible = ref(false)
      var infoPressTimer = null
      var infoPressStart = { x: 0, y: 0 }
      var infoLongPressFired = false
      var INFO_LONG_PRESS_MS = 500
      var INFO_MOVE_TOLERANCE = 8

      watch(
        function () {
          return playerStore.currentTime
        },
        function (current) {
          if (!dragging.value) {
            sliderValue.value = current
          }
        },
        { immediate: true }
      )

      var track = computed(function () {
        return playerStore.track
      })

      var isPlaying = computed(function () {
        return playerStore.isPlaying
      })

      var repeatActive = computed(function () {
        return playerStore.repeat
      })

      var replayGainMode = computed(function () {
        return playerStore.replayGainMode
      })

      var isMobile = matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0

      // Album cover hover preview
      var coverEl = ref(null)
      var previewVisible = ref(false)
      var previewStyle = ref({})

      var PREVIEW_SIZE = 250
      var PREVIEW_MARGIN = 8
      var PREVIEW_DELAY = 1500
      var previewTimer = null

      function clearPreviewTimer() {
        if (previewTimer) {
          clearTimeout(previewTimer)
          previewTimer = null
        }
      }

      function showPreview() {
        if (isMobile) {
          return
        }

        clearPreviewTimer()
        previewTimer = window.setTimeout(openPreview, PREVIEW_DELAY)
      }

      function openPreview() {
        previewTimer = null

        if (!track.value || !track.value.image || !coverEl.value) {
          return
        }

        var rect = coverEl.value.getBoundingClientRect()
        var size = Math.min(
          PREVIEW_SIZE,
          window.innerWidth - PREVIEW_MARGIN * 2,
          rect.top - PREVIEW_MARGIN * 2
        )
        var left = Math.min(
          Math.max(rect.left, PREVIEW_MARGIN),
          window.innerWidth - size - PREVIEW_MARGIN
        )
        var top = rect.top - size - PREVIEW_MARGIN

        previewStyle.value = {
          width: size + 'px',
          height: size + 'px',
          left: left + 'px',
          top: top + 'px',
        }

        previewVisible.value = true
      }

      function hidePreview() {
        clearPreviewTimer()
        previewVisible.value = false
      }

      // Long press (touch devices)
      var LONG_PRESS_DELAY = 500
      var MOVE_TOLERANCE = 10
      var longPressTimer = null
      var longPressFired = false
      var touchActive = false
      var touchOrigin = { x: 0, y: 0 }

      function clearLongPressTimer() {
        if (longPressTimer) {
          clearTimeout(longPressTimer)
          longPressTimer = null
        }
      }

      function onTouchStart(event) {
        var touch = event.touches[0]

        if (!touch) {
          return
        }

        touchActive = true
        longPressFired = false
        touchOrigin = { x: touch.clientX, y: touch.clientY }
        clearLongPressTimer()

        longPressTimer = window.setTimeout(function () {
          longPressTimer = null
          longPressFired = true
          openPreview()
        }, LONG_PRESS_DELAY)
      }

      function onTouchMove(event) {
        if (!longPressTimer) {
          return
        }

        var touch = event.touches[0]

        if (!touch) {
          return
        }

        var dx = touch.clientX - touchOrigin.x
        var dy = touch.clientY - touchOrigin.y

        if (Math.sqrt(dx * dx + dy * dy) > MOVE_TOLERANCE) {
          clearLongPressTimer()
        }
      }

      function onTouchEnd(event) {
        touchActive = false
        clearLongPressTimer()

        if (longPressFired) {
          event.preventDefault()
          hidePreview()
        }
      }

      function onTouchCancel() {
        touchActive = false
        clearLongPressTimer()
        hidePreview()
      }

      function onContextMenu(event) {
        if (touchActive || longPressFired) {
          event.preventDefault()
        }
      }

      function onCoverClick() {
        if (longPressFired) {
          longPressFired = false
          return
        }

        onAlbumClick()
      }

      var isFavourite = computed(function () {
        return !!track.value && favouriteStore.get('track', track.value.id)
      })

      var playIcon = computed(function () {
        if (isPlaying.value) {
          return 'pause'
        }

        return 'play'
      })

      var favouriteIcon = computed(function () {
        if (isFavourite.value) {
          return 'heart-fill'
        }

        return 'heart'
      })

      var playTitle = computed(function () {
        if (isPlaying.value) {
          return 'Pause'
        }

        return 'Play'
      })

      var documentTitle = computed(function () {
        var title = null
        var artist = null
        var album = null

        if (track.value) {
          title = track.value.title
          album = track.value.album

          if (track.value.artists) {
            artist = track.value.artists.map(function (item) {
              return item.name
            }).join(', ')
          }
        }

        return [title, artist || album, 'Airdrome'].filter(function (value) {
          return !!value
        }).join(' • ')
      })

      function showProgressTooltip() {
        var root = null

        if (progressSlider.value) {
          root = progressSlider.value.$el
        }

        if (!root) {
          return
        }

        var handle = root.querySelector('.slider-handle') || root.querySelector('[tabindex]')

        if (!handle) {
          return
        }

        handle.focus()

        if (tooltipTimer.value) {
          clearTimeout(tooltipTimer.value)
        }

        tooltipTimer.value = window.setTimeout(function () {
          handle.blur()
        }, 5000)
      }

      watch(
        documentTitle,
        function (value) {
          document.title = value
        },
        { immediate: true }
      )

      function onAlbumClick() {
        var currentTrack = playerStore.track

        if (!currentTrack || !currentTrack.albumId) {
          return
        }

        if (route.name === 'album' && String(route.params.id) === String(currentTrack.albumId)) {
          router.back()
        } else {
          router.push({ name: 'album', params: { id: currentTrack.albumId } })
        }
      }

      function focusSlider() {
        var root = null
        var element = null

        if (progressSlider.value) {
          root = progressSlider.value.$el
        }

        if (root) {
          element = root.querySelector('[tabindex]')
        }

        if (element) {
          element.focus()
        }
      }

      function blurSlider() {
        var root = null
        var element = null

        if (progressSlider.value) {
          root = progressSlider.value.$el
        }

        if (root) {
          element = root.querySelector('[tabindex]')
        }

        if (element) {
          element.blur()
        }
      }

      function onSliderDragStart() {
        dragging.value = true
        showProgressTooltip()
      }

      function onSliderDragEnd() {
        dragging.value = false
      }

      function onSliderUpdate(value) {
        playerStore.seek(value)
        dragging.value = false
      }

      function formatter(value) {
        return formatDuration(value) + ' / ' + formatDuration(playerStore.duration)
      }

      function onSliderClick(event) {
        var sliderElement = null

        if (progressSlider.value) {
          sliderElement = progressSlider.value.$el
        }

        var target = sliderElement || event.currentTarget
        var rect = target.getBoundingClientRect()
        var ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))

        playerStore.seek(ratio * playerStore.duration)
        showProgressTooltip()
      }

      function playPause() {
        playerStore.playPause()
      }

      function next() {
        playerStore.next(true)
      }

      function back() {
        playerStore.back()
      }

      function toggleReplayGain() {
        playerStore.toggleReplayGain()
      }

      function toggleRepeat() {
        playerStore.toggleRepeat()
      }

      function toggleFavourite() {
        if (track.value) {
          favouriteStore.toggle('track', track.value.id)
        }
      }

      function isInfoInteractive(target) {
        if (!target || !target.closest) {
          return false
        }

        return !!target.closest(
          'button, a, input, textarea, select, .player-cover, .playback-slider, .volume-slider, .overflow-menu-wrap, .slider-click-zone, .btn-close'
        )
      }

      function clearInfoPress() {
        if (infoPressTimer) {
          clearTimeout(infoPressTimer)
          infoPressTimer = null
        }
      }

      function openInfo() {
        if (!track.value) {
          return
        }

        infoVisible.value = true
      }

      function onInfoContextMenu(event) {
        if (isInfoInteractive(event.target)) {
          return
        }

        openInfo()
      }

      function onInfoMouseDown(event) {
        infoLongPressFired = false
        clearInfoPress()

        if (event.button !== 0 || isInfoInteractive(event.target)) {
          return
        }

        infoPressStart = { x: event.clientX, y: event.clientY }

        infoPressTimer = window.setTimeout(function () {
          infoPressTimer = null
          infoLongPressFired = true
          openInfo()
        }, INFO_LONG_PRESS_MS)
      }

      function onInfoMouseMove(event) {
        if (!infoPressTimer) {
          return
        }

        if (
          Math.abs(event.clientX - infoPressStart.x) > INFO_MOVE_TOLERANCE ||
          Math.abs(event.clientY - infoPressStart.y) > INFO_MOVE_TOLERANCE
        ) {
          clearInfoPress()
        }
      }

      function onInfoMouseUp() {
        clearInfoPress()
      }

      function onInfoTouchStart(event) {
        infoLongPressFired = false
        clearInfoPress()

        if (isInfoInteractive(event.target)) {
          return
        }

        var touch = event.touches[0]

        if (!touch) {
          return
        }

        infoPressStart = { x: touch.clientX, y: touch.clientY }

        infoPressTimer = window.setTimeout(function () {
          infoPressTimer = null
          infoLongPressFired = true
          openInfo()
        }, INFO_LONG_PRESS_MS)
      }

      function onInfoTouchMove(event) {
        if (!infoPressTimer) {
          return
        }

        var touch = event.touches[0]

        if (!touch) {
          return
        }

        if (
          Math.abs(touch.clientX - infoPressStart.x) > INFO_MOVE_TOLERANCE ||
          Math.abs(touch.clientY - infoPressStart.y) > INFO_MOVE_TOLERANCE
        ) {
          clearInfoPress()
        }
      }

      function onInfoTouchEnd() {
        clearInfoPress()
      }

      function onInfoClickCapture(event) {
        if (!infoLongPressFired) {
          return
        }

        infoLongPressFired = false
        event.preventDefault()
        event.stopPropagation()
      }

      onBeforeUnmount(function () {
        if (tooltipTimer.value) {
          clearTimeout(tooltipTimer.value)
        }

        clearPreviewTimer()
        clearLongPressTimer()
        clearInfoPress()
      })

      return {
        ReplayGainMode: ReplayGainMode,
        playerStore: playerStore,
        sliderValue: sliderValue,
        dragging: dragging,
        track: track,
        isPlaying: isPlaying,
        repeatActive: repeatActive,
        replayGainMode: replayGainMode,
        isFavourite: isFavourite,
        playIcon: playIcon,
        favouriteIcon: favouriteIcon,
        playTitle: playTitle,
        infoVisible: infoVisible,
        openInfo: openInfo,
        onInfoContextMenu: onInfoContextMenu,
        onInfoMouseDown: onInfoMouseDown,
        onInfoMouseMove: onInfoMouseMove,
        onInfoMouseUp: onInfoMouseUp,
        onInfoTouchStart: onInfoTouchStart,
        onInfoTouchMove: onInfoTouchMove,
        onInfoTouchEnd: onInfoTouchEnd,
        onInfoClickCapture: onInfoClickCapture,
        progressSlider: progressSlider,
        coverEl: coverEl,
        previewVisible: previewVisible,
        previewStyle: previewStyle,
        showPreview: showPreview,
        hidePreview: hidePreview,
        onTouchStart: onTouchStart,
        onTouchMove: onTouchMove,
        onTouchEnd: onTouchEnd,
        onTouchCancel: onTouchCancel,
        onContextMenu: onContextMenu,
        onCoverClick: onCoverClick,
        focusSlider: focusSlider,
        blurSlider: blurSlider,
        onAlbumClick: onAlbumClick,
        onSliderDragStart: onSliderDragStart,
        onSliderDragEnd: onSliderDragEnd,
        onSliderUpdate: onSliderUpdate,
        onSliderClick: onSliderClick,
        formatter: formatter,
        playPause: playPause,
        next: next,
        back: back,
        toggleReplayGain: toggleReplayGain,
        toggleRepeat: toggleRepeat,
        toggleFavourite: toggleFavourite,
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
    flex-wrap: nowrap;
    gap: 0.15rem;
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
    border-radius: var(--theme-radius-sm);
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
    border-radius: var(--theme-radius-md);
    box-shadow: var(--theme-shadow-2);
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
    --bs-btn-font-size: 2.5rem;
    width: 48px;
    height: 48px;
    padding: 0;
    flex: 0 0 auto;
  }

  .player .btn-skip {
    --bs-btn-font-size: 1.6rem;
    width: 40px;
    height: 40px;
    padding: 0;
    flex: 0 0 auto;
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
    border-radius: var(--theme-radius-md);
    border: 1px solid var(--theme-border);
    box-shadow: var(--theme-shadow-2);
    overflow: hidden;
  }

  /* Progress slider
     Horizontal padding (10px) matches .player-cover's margin, so the
     slider bar's left edge lines up with the cover's left edge. */
  .slider-click-zone {
    position: relative;
    box-sizing: border-box;
    padding: 15px 15px 5px;
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
    margin: 0 !important;
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
      --bs-btn-font-size: 1.4rem;
      width: 36px;
      height: 36px;
    }

    .player .btn-play {
      --bs-btn-font-size: 2.2rem;
      width: 44px;
      height: 44px;
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
