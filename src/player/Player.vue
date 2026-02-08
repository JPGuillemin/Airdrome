<template>
  <div
    class="player"
    :class="{ visible: track }"
  >
    <!-- visual layer (background + radius ONLY) -->
    <div class="player-bg">
      <!-- layout layer (NO clipping) -->
      <div class="player-content d-flex">
        <div class="flex-fill">

          <!-- progress -->
          <div class="slider-click-zone" @click="onSliderClick($event)">
            <Slider
              v-model="sliderValue"
              :min="0"
              :max="playerStore.duration"
              :step="0.1"
              :tooltips="true"
              show-tooltip="drag"
              :format="formatter"
              orientation="horizontal"
              :lazy="true"
              class="playback-slider px-1 real-slider"
              @start="onSliderDragStart"
              @end="onSliderDragEnd"
              @change="onSliderUpdate"
            />
          </div>

          <!-- main row -->
          <div class="row align-items-center m-0 elevated">

            <!-- track info -->
            <div class="col p-0 d-flex flex-nowrap align-items-center justify-content-start flex-grow-1">
              <template v-if="track">
                <div
                  v-if="track.albumId"
                  class="pt-0 pb-3 ps-3 pe-2"
                  style="cursor: pointer"
                  @click="onAlbumClick"
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

                <div style="min-width: 0; overflow: hidden">
                  <div class="title-text">
                    {{ track.title }}
                  </div>
                  <div class="text-truncate text-muted pb-3">
                    <template v-if="track.artists.length">
                      <span
                        v-for="(artist, index) in track.artists"
                        :key="artist.id"
                      >
                        <span v-if="index > 0">, </span>
                        <router-link
                          :to="{ name: 'artist', params: { id: artist.id } }"
                          class="text-muted"
                        >
                          {{ artist.name }}
                        </router-link>
                      </span>
                    </template>
                    <template v-else-if="track.album">
                      {{ track.album }}
                    </template>
                  </div>
                </div>
              </template>
            </div>

            <!-- transport -->
            <div class="col-auto pb-3 d-flex align-items-center">
              <b-button variant="transparent" class="mx-0" @click="previous">
                <Icon icon="skip-start" />
              </b-button>

              <b-button
                variant="transparent"
                size="lg"
                class="btn-play mx-0"
                @click="playPause"
              >
                <Icon :icon="isPlaying ? 'pause' : 'play'" />
              </b-button>

              <b-button variant="transparent" class="mx-0" @click="next">
                <Icon icon="skip-end" />
              </b-button>
            </div>

            <!-- right controls -->
            <div class="col-auto pb-3">
              <div class="d-flex flex-nowrap justify-content-end pe-3">

                <div class="m-0 d-none d-md-inline-flex align-items-center">
                  <b-button
                    title="Like"
                    variant="transparent"
                    class="m-0"
                    @click="toggleFavourite"
                  >
                    <Icon :icon="isFavourite ? 'heart-fill' : 'heart'" />
                  </b-button>

                  <b-button
                    v-if="track && track.replayGain"
                    title="R.Gain"
                    variant="transparent"
                    class="m-0"
                    :class="{ 'theme-primary': replayGainMode !== ReplayGainMode.None }"
                    @click="toggleReplayGain"
                  >
                    <IconReplayGain v-if="replayGainMode === ReplayGainMode.None" />
                    <IconReplayGainTrack v-else-if="replayGainMode === ReplayGainMode.Track" />
                    <IconReplayGainAlbum v-else />
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
                      <IconReplayGainTrack v-else-if="replayGainMode === ReplayGainMode.Track" />
                      <IconReplayGainAlbum v-else />
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
  import { defineComponent, watch, ref, computed } from 'vue'
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

      const sliderValue = ref(0)
      const dragging = ref(false)

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
      function next() { playerStore.next() }
      function previous() { playerStore.previous() }
      function toggleReplayGain() { playerStore.toggleReplayGain() }
      function toggleRepeat() { playerStore.toggleRepeat() }
      function toggleFavourite() {
        if (track.value) {
          favouriteStore.toggle('track', track.value.id)
        }
      }

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

        onAlbumClick,
        onSliderDragStart,
        onSliderDragEnd,
        onSliderUpdate,
        onSliderClick,
        formatter,

        playPause,
        next,
        previous,
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
  }

  .player.visible {
    height: auto;
    max-height: 110px;
  }

  .small-cover {
    display: block;
    width: 58px;
    height: 58px;
    object-fit: cover;
    border-radius: 5px;
    flex-shrink: 0;
    filter: invert(0) hue-rotate(0deg) brightness(1) contrast(1);
  }

  .col {
    min-width: 0;
  }

  .visible {
    height: auto;
    max-height: 110px;
  }

  .icon {
    display: flex;
    align-items: center;
  }

  .btn-play {
    --bs-btn-font-size: 1.9rem;
  }

  .b-button {
    --bs-btn-font-size: 1.3rem;
  }

  .row.align-items-center.m-0.elevated {
    padding-top: 1px;
    padding-bottom: 1px;
  }

  .playback-slider {
    --slider-connect-bg: var(--bs-primary);
    --slider-bg: var(--bs-secondary);
    --slider-handle-bg: var(--bs-primary);
    --slider-tooltip-bg: var(--bs-primary);
    margin: auto;
    background: transparent;
  }

  .volume-slider {
    --slider-connect-bg: var(--bs-primary);
    --slider-bg: var(--bs-secondary);
    --slider-handle-bg: var(--bs-primary);
    width: 4px !important;
    height: 120px !important;
    margin: auto;
  }

  .player-bg {
    background: var(--theme-elevation-1);
  }

  .slider-click-zone {
    position: relative;
    padding-top: 10px;
    padding-bottom: 10px;
    cursor: pointer;
    background: var(--theme-elevation-1) !important;
  }

  .slider-click-zone .real-slider {
    pointer-events: none; /* so clicks go to wrapper instead */
  }

  .slider-click-zone .real-slider * {
    pointer-events: auto; /* but slider handles still work */
  }

  .slider-click-zone,
  .row.elevated {
    background: transparent !important;
  }

  @media(max-width: 768px) {
    .player {
      font-size: 0.7rem;
      position: fixed;
      z-index: 1000;
      bottom: var(--mobile-nav-height);
      left: 0;
      right: 0;
      height: 0;
      max-height: 0;
      transition: max-height 0.5s;
      border-radius: 12px;
      border: 1px solid var(--theme-elevation-2);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    }

    .player-bg {
      border-radius: 12px;
    }

    .visible {
      height: auto;
      max-height: 110px;
    }

    .title-text {
      color: var(--bs-primary);
      display: inline-block;
      white-space: nowrap;
      overflow: hidden;
      animation: slide-text 10s linear infinite;
      animation-delay: 0s;
    }

    @keyframes slide-text {
      0% { transform: translateX(35%); }
      100% { transform: translateX(-65%); }
    }

    /* Reduce padding of right column */
    .col-auto.col-md.pb-3 {
      padding-right: 4px !important;
      padding-left: 0 !important;
    }

    /* Reduce spacing of the button container */
    .d-flex.flex-nowrap.justify-content-end.pe-3 {
      padding-right: 2px !important;
    }

    /* Reduce spacing inside the overflow menu items */
    .on-top {
      padding-left: 6px !important;
      padding-right: 6px !important;
    }

    /* Reduce space between prev/play/next */
    .col-auto.pb-3.d-flex.align-items-center .btn {
      margin: 0 2px !important;
      padding-left: 4px !important;
      padding-right: 4px !important;
    }

    /* Reduce play button size */
    .col-auto.pb-3.d-flex.align-items-center .btn-play {
      --bs-btn-font-size: 1.5rem;
    }

    .overflow-menu,
    .b-button {
      border-radius: 12px;
    }
  }
</style>
