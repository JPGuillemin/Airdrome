<template>
  <div :class="{'visible': track}" class="player d-flex">
    <div class="flex-fill">
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
        class="playback-slider"
        @start="onSliderDragStart"
        @end="onSliderDragEnd"
        @change="onSliderUpdate"
      />
      <div class="row align-items-center m-0 elevated">
        <!-- Track info --->
        <div class="col p-0 d-flex flex-nowrap align-items-center justify-content-start" style="width: 0; min-width: 0">
          <template v-if="track">
            <div
              v-if="track.albumId"
              style="padding: 12px; cursor: pointer"
              @click="onAlbumClick"
            >
              <img v-if="track.image" :src="track.image" class="small-cover cursor-pointer">
              <img v-else src="@/shared/assets/fallback.svg" class="small-cover cursor-pointer">
            </div>
            <div style="min-width: 0; overflow: hidden">
              <div class="title-text">
                {{ track.title }}
              </div>
              <div class="text-truncate text-muted">
                <template v-if="track.artists.length > 0">
                  <span v-for="(artist, index) in track.artists" :key="artist.id">
                    <span v-if="index > 0">, </span>
                    <router-link :to="{name: 'artist', params: { id: artist.id }}" class="text-muted">{{ artist.name }}</router-link>
                  </span>
                </template>
                <template v-else-if="track.album">
                  {{ track.album }}
                </template>
              </div>
            </div>
          </template>
        </div>

        <!-- Controls--->
        <div class="col-auto p-0 d-flex align-items-center">
          <b-button
            title="Shuffle"
            variant="transparent"
            class="d-none d-md-inline-block mx-0.5"
            :class="{ 'theme-primary': shuffleActive }"
            @click="toggleShuffle">
            <Icon icon="shuffle" />
          </b-button>

          <b-button
            variant="transparent"
            class="mx-0.5"
            @click="previous">
            <Icon icon="skip-start" />
          </b-button>

          <b-button
            variant="transparent"
            size="lg"
            class="btn-play mx-0"
            @click="playPause">
            <Icon :icon="isPlaying ? 'pause' : 'play'" />
          </b-button>

          <b-button
            variant="transparent"
            class="mx-0.5"
            @click="next">
            <Icon icon="skip-end" />
          </b-button>

          <b-button
            title="Repeat"
            variant="transparent"
            class="d-none d-md-inline-block mx-0.5"
            :class="{ 'theme-primary': repeatActive }"
            @click="toggleRepeat">
            <Icon icon="repeat" />
          </b-button>
        </div>

        <!-- Controls right --->
        <div class="col-auto col-md p-0">
          <div class="d-flex flex-nowrap justify-content-end pe-3">
            <div class="m-0 d-none d-md-inline-flex align-items-center">
              <b-button
                title="Like"
                variant="transparent" class="m-0"
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
                <IconReplayGainAlbum v-else-if="replayGainMode === ReplayGainMode.Album" />
              </b-button>
              <Dropdown variant="transparent" align="center" direction="up" menu-style="min-width:0px;" title="Volume">
                <template #button-content>
                  <Icon :icon="isMuted ? 'mute' : 'volume'" />
                </template>
                <Slider
                  v-model="playerStore.volume"
                  orientation="vertical"
                  direction="rtl"
                  :min="0"
                  :max="1"
                  :step="0.01"
                  :tooltips="false"
                  show-tooltip="never"
                  class="volume-slider"
                  @update="playerStore.setVolume"
                />
              </Dropdown>
            </div>
            <OverflowMenu class="d-md-none" variant="transparent" direction="up">
              <div class="d-flex justify-content-between align-items-center px-3 py-1">
                <span>Volume</span>
                <Slider
                  v-model="playerStore.volume"
                  orientation="vertical"
                  direction="rtl"
                  :min="0"
                  :max="1"
                  :step="0.01"
                  :tooltips="false"
                  show-tooltip="never"
                  class="volume-slider"
                  @update="playerStore.setVolume"
                />
              </div>
              <div class="d-flex justify-content-between px-3 py-1">
                <span>Repeat</span>
                <b-button
                  title="Repeat"
                  variant="transparent"
                  class="m-0 px-2 py-0"
                  :class="{ 'theme-primary': repeatActive }"
                  @click.stop="toggleRepeat">
                  <Icon icon="repeat" />
                </b-button>
              </div>
              <div class="d-flex justify-content-between px-3 py-1">
                <span>Shuffle</span>
                <b-button
                  title="Shuffle"
                  variant="transparent"
                  class="m-0 px-2 py-0"
                  :class="{ 'theme-primary': shuffleActive }"
                  @click.stop="toggleShuffle">
                  <Icon icon="shuffle" />
                </b-button>
              </div>
              <div class="d-flex justify-content-between px-3 py-1">
                <span>Like</span>
                <b-button variant="transparent" class="m-0 px-2 py-0" @click.stop="toggleFavourite">
                  <Icon :icon="isFavourite ? 'heart-fill' : 'heart'" />
                </b-button>
              </div>

              <div v-if="track && track.replayGain" class="d-flex justify-content-between px-3 py-1">
                <span>R.Gain</span>
                <b-button
                  title="ReplayGain"
                  variant="transparent"
                  class="m-0 px-2 py-0"
                  :class="{ 'theme-primary': replayGainMode !== ReplayGainMode.None }"
                  @click.stop="toggleReplayGain">
                  <small v-if="replayGainMode === ReplayGainMode.None" class="d-flex align-items-center">
                    Off
                  </small>
                  <IconReplayGainTrack v-else-if="replayGainMode === ReplayGainMode.Track" />
                  <IconReplayGainAlbum v-else-if="replayGainMode === ReplayGainMode.Album" />
                </b-button>
              </div>
            </OverflowMenu>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
  import { defineComponent, watch, ref } from 'vue'
  import { ReplayGainMode } from './audio'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlayerStore } from '@/player/store'
  import Dropdown from '@/shared/components/Dropdown.vue'
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
      Dropdown,
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
          // Only update slider if user is not dragging
          if (!dragging.value) {
            sliderValue.value = current
          }
        },
        { immediate: true }
      )

      const onAlbumClick = () => {
        const track = playerStore.track
        if (!track?.albumId) return

        if (route.name === 'album' && String(route.params.id) === String(track.albumId)) {
          router.back()
        } else {
          router.push({ name: 'album', params: { id: track.albumId } })
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
      return { onAlbumClick, formatter, ReplayGainMode, favouriteStore, sliderValue, onSliderUpdate, playerStore, dragging, onSliderDragEnd, onSliderDragStart, }
    },
    computed: {
      track() { return this.playerStore.track },
      isPlaying() { return this.playerStore.isPlaying },
      isMuted() { return this.playerStore.volume <= 0 },
      repeatActive() { return this.playerStore.repeat },
      shuffleActive() { return this.playerStore.shuffle },
      replayGainMode(): ReplayGainMode { return this.playerStore.replayGainMode },
      isFavourite(): boolean {
        return !!this.track && this.favouriteStore.get('track', this.track.id)
      },
      documentTitle(): string {
        return [
          this.track?.title,
          this.track?.artists?.map(a => a.name).join(', ') || this.track?.album,
          'Airdrome'
        ].filter(Boolean).join(' • ')
      },
    },
    watch: {
      documentTitle: {
        immediate: true,
        handler(value: string) {
          document.title = value
        }
      }
    },
    methods: {
      playPause() { this.playerStore.playPause() },
      next() { this.playerStore.next() },
      previous() { this.playerStore.previous() },
      toggleReplayGain() { this.playerStore.toggleReplayGain() },
      toggleRepeat() { this.playerStore.toggleRepeat() },
      toggleShuffle() { this.playerStore.toggleShuffle() },
      toggleFavourite() { this.favouriteStore.toggle('track', this.track!.id) },
    }
  })
</script>

<style scoped>
  .player {
    position: fixed;
    z-index: 1000;
    bottom: 0;
    left: 0;
    right: 0;
    height: 0;
    max-height: 0;
    transition: max-height 0.5s;
    background: var(--bs-body-bg);
  }
  .small-cover {
    display: block;
    width: 62px;
    height: 62px;
    object-fit: cover;
    border-radius: 3px;
    flex-shrink: 0;
    filter: invert(0) hue-rotate(0deg) brightness(1) contrast(1);
  }
  @media(max-width: 442px) {
    .player {
      font-size: 0.7rem;
      position: fixed;
      z-index: 2000;
      bottom: 0;
      left: 0;
      right: 0;
      height: 0;
      max-height: 0;
      transition: max-height 0.5s;
    }
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
    --slider-height: 6px;
    --slider-connect-bg: var(--bs-primary);
    --slider-bg: var(--bs-secondary);
    --slider-handle-width: 20px;
    --slider-handle-height: 20px;
    --slider-handle-ring-size: 24px;
    --slider-handle-ring-opacity: 1%;
    --slider-handle-border: 3px solid var(--bs-primary);
    --slider-handle-bg: var(--bs-primary);
    --slider-tooltip-bg: var(--bs-primary);
    margin: auto;
    background: var(--bs-body-bg);
  }

  .volume-slider {
    --slider-connect-bg: var(--bs-primary);
    --slider-bg: var(--bs-secondary);
    --slider-handle-bg: var(--bs-primary);
    width: 4px !important;
    height: 120px !important;
    margin: auto;
  }

  @media (min-width: 768px) {
    .title-text {
      color: var(--bs-primary);
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  @media (max-width: 767.98px) {
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
  }
</style>
