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
              show-tooltip="drag"
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
                  class="pt-0 pb-3 ps-3 pe-2"
                  style="cursor: pointer"
                  @click.stop="onAlbumClick"
                >
                  <img
                    v-if="track.image"
                    :src="track.image"
                    class="small-cover"
                  >
                  <img
                    v-else
                    src="@/shared/assets/fallback.svg"
                    class="small-cover"
                  >
                </div>

                <div style="min-width:0; flex:1;">
                  <router-link
                    @click.stop
                    :to="{ name: 'album', params: { id: track.albumId } }"
                    class="player-link title-text"
                  >
                    {{ track.title }}
                  </router-link>
                  <div class="text-truncate text-muted pb-3">
                    <template v-if="track.artists.length">
                      <router-link
                        @click.stop
                        :to="{ name: 'artist', params: { id: track.artists[0].id } }"
                        class="player-link player-link-small artist-truncate"
                      >
                        {{ track.artists[0].name }}
                      </router-link>
                    </template>
                    <template v-else-if="track.album">
                      {{ track.album }}
                    </template>
                  </div>
                </div>
              </template>
            </div>

            <!-- transport -->
            <div class="transport-controls">
              <b-button variant="transparent" class="mx-0 btn-skip" @click.stop="back">
                <Icon icon="skip-start" />
              </b-button>

              <b-button
                variant="transparent"
                size="lg"
                class="btn-play mx-0"
                @click.stop="playPause"
              >
                <Icon :icon="isPlaying ? 'pause' : 'play'" />
              </b-button>

              <b-button variant="transparent" class="mx-0 btn-skip" @click.stop="next">
                <Icon icon="skip-end" />
              </b-button>
            </div>

            <!-- right controls -->
            <div class="right-controls">
              <div class="d-flex flex-nowrap justify-content-end pe-3">

                <div class="m-0 d-none d-md-inline-flex align-items-center">
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

                </OverflowMenu>

              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
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
      }

      const onSliderDragEnd = () => {
        dragging.value = false
      }

      const onSliderUpdate = (value: number) => {
        playerStore.seek(value)
        dragging.value = false
      }

      const formatter = (value: number) => {
        return `${formatDuration(value)} / ${formatDuration(playerStore.duration)}`
      }

      const onSliderClick = (e: MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const x = e.clientX - rect.left
        const ratio = x / rect.width
        const newTime = ratio * playerStore.duration
        playerStore.seek(newTime)
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
  .transport-controls {
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

  /* Metadata */
  .player :deep(.player-link) {
    font-family: var(--font-metadata);
    color: var(--theme-text);
    text-decoration: none;
    transition: color 0.15s ease;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .player :deep(.player-link:hover) {
    color: var(--bs-primary);
  }

  .player :deep(.player-link-small) {
    font-size: 0.85em;
  }

  .player-link.title-text {
    display: block;
    width: 100%;
    min-width: 0;
  }

  /* Cover */
  .small-cover {
    display: block;
    width: 58px;
    height: 58px;
    object-fit: cover;
    border-radius: 5px;
    flex-shrink: 0;
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
  }

  .player .btn-skip {
    --bs-btn-font-size: 1.5rem;
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
    padding-bottom: 10px;
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

  /* Text truncation */
  .artist-truncate {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .transport-controls,
  .right-controls {
    align-items: center;
  }

  .transport-controls > *,
  .right-controls > * {
    transform: translateY(-5px);
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

    .transport-controls,
    .right-controls {
      height: 55px;
    }

    .player .btn-skip {
      --bs-btn-font-size: 1.2rem;
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
