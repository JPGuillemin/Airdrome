<template>
  <div v-if="artist" class="main-content">
    <div class="header-wrapper">
      <Custom :image="artist.image" :hover="'Play/Pause'" class="cursor-pointer" @click="shuffleNow">
        <div class="header-title-wrapper">
          <div class="header-title mt-3">
            {{ artist.name }}
          </div>
        </div>

        <div class="header-info-wrapper">
          <div class="header-info-one">
            <span class="text-nowrap">
              <strong>{{ artist.albumCount }}</strong> albums
            </span>
            <span class="mx-2">•</span>
            <span class="text-nowrap">
              <strong>{{ artist.trackCount }}</strong> tracks
            </span>
          </div>

          <div class="header-info-two">
            <template v-if="artist.genres.length > 0">
              <span v-for="({ name: genre }, index) in artist.genres" :key="genre">
                <span v-if="index > 0">, </span>
                <router-link :to="{name: 'genre', params: { id: genre }}">
                  {{ genre }}
                </router-link>
              </span>
            </template>
          </div>
        </div>

        <div v-if="artist.lastFmUrl || artist.musicBrainzUrl">
          <span class="d-inline-flex flex-nowrap">
            <ExternalLink v-if="artist.lastFmUrl" :href="artist.lastFmUrl" class="btn btn-link p-0 me-2" title="Last.fm">
              <IconLastFm />
            </ExternalLink>
            <ExternalLink v-if="artist.musicBrainzUrl" :href="artist.musicBrainzUrl" class="btn btn-link me-2 p-0" title="MusicBrainz">
              <IconMusicBrainz />
            </ExternalLink>
          </span>
        </div>

        <div class="text-nowrap mt-3">
          <b-button v-if="artist.trackCount > 0" v-longpress-tooltip variant="transparent" class="me-2" title="Play Artist Top Tracks" @click="playNow">
            <Icon icon="play" />
          </b-button>
          <b-button v-if="artist.trackCount > 0" v-longpress-tooltip variant="transparent" class="me-2" title="Artist Shuffle" @click="shuffleNow">
            <Icon icon="random" />
          </b-button>
          <b-button v-if="artist.trackCount > 0" v-longpress-tooltip variant="transparent" class="me-2" title="Artist Radio" @click="RadioNow">
            <Icon icon="radio" />
          </b-button>
          <b-button v-if="artist.trackCount > 0" v-longpress-tooltip variant="transparent" class="me-2" title="Like Artist" @click="toggleFavourite">
            <Icon :icon="isFavourite ? 'heart-fill' : 'heart'" />
          </b-button>
        </div>
      </Custom>
    </div>
    <div class="content-wrapper">
      <template v-if="artist.topTracks.length > 0">
        <div class="d-flex justify-content-between mt-3 mb-2">
          <div class="d-inline-flex align-items-center">
            <Icon icon="tracks" class="title-color me-2" />
            <span class="section-title">
              Top tracks
            </span>
          </div>
        </div>
        <TrackList
          :tracks="artist.topTracks"
          :no-artist="true"
        />
      </template>
      <template v-if="artist.albums.length > 0">
        <div class="d-inline-flex align-items-center">
          <Icon icon="albums" class="title-color me-2" />
          <span class="section-title">
            Albums
          </span>
        </div>
        <AlbumList :items="artist.albums" tile-size="90" allow-h-scroll />
      </template>
      <template v-if="artist.similarArtist.length > 0">
        <div class="d-inline-flex align-items-center">
          <Icon icon="artists" class="title-color me-2" />
          <span class="section-title">
            Similar artists
          </span>
        </div>
        <ArtistList :items="artist.similarArtist" tile-size="90" allow-h-scroll />
      </template>
      <template v-if="artist.description">
        <div class="d-inline-flex align-items-center">
          <Icon icon="info" class="title-color me-2" />
          <span class="section-title">
            Background info
          </span>
        </div>
        <span class="d-flex justify-content-between adapt-text mb-2" style="text-align: justify;">
          {{ artist.description }}
        </span>
      </template>
    </div>
  </div>
</template>
<script lang="ts">
  import { defineComponent, ref, onMounted, inject, computed } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import TrackList from '@/library/track/TrackList.vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { useMainStore } from '@/shared/store'
  import { usePlayerStore } from '@/player/store'
  import IconLastFm from '@/shared/components/IconLastFm.vue'
  import IconMusicBrainz from '@/shared/components/IconMusicBrainz.vue'
  import { useRadioStore } from '@/player/radio'
  import { longPressTooltip } from '@/shared/tooltips'

  export default defineComponent({
    components: {
      IconMusicBrainz,
      IconLastFm,
      AlbumList,
      ArtistList,
      TrackList,
    },

    directives: {
      'longpress-tooltip': longPressTooltip
    },

    props: {
      id: { type: String, required: true },
    },

    setup(props) {
      const mainStore = useMainStore()
      const favouriteStore = useFavouriteStore()
      const playerStore = usePlayerStore()

      const radioStore = useRadioStore()

      const playNow = () => playerStore.playNow(artist.value.topTracks)
      const shuffleNow = () => radioStore.shuffleArtist(props.id)
      const RadioNow = () => radioStore.radioArtist(props.id)

      const artist = ref<any>(null)
      const api = inject('$api') as any

      const isFavourite = computed(() => favouriteStore.get('artist', props.id))

      const toggleFavourite = () => favouriteStore.toggle('artist', props.id)
      const toggleAlbumSortOrder = () => mainStore.toggleArtistAlbumSortOrder()

      onMounted(async() => {
        artist.value = await api.getArtistDetails(props.id)
      })

      return {
        mainStore,
        favouriteStore,
        playerStore,
        artist,
        isFavourite,
        playNow,
        shuffleNow,
        RadioNow,
        toggleFavourite,
        toggleAlbumSortOrder,
      }
    },
  })
</script>
