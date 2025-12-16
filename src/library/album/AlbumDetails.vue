<template>
  <div v-if="album" class="main-content">
    <div class="header-wrapper">
      <Custom :image="album.image" :hover="'Play/Pause'" class="cursor-pointer" @click="playNow">
        <div class="header-title-wrapper">
          <div class="header-title">
            {{ album.name }}
          </div>
        </div>

        <div class="header-info-wrapper">
          <div class="header-info-one">
            <template v-if="album.artists?.length">
              <span v-for="(artist, index) in album.artists" :key="artist.id" class="d-inline-flex flex-nowrap">
                <span v-if="index > 0">, </span>
                <router-link :to="{ name: 'artist', params: { id: artist.id }}">
                  {{ artist.name }}
                </router-link>
              </span>
            </template>
            <template v-if="album.year">
              <span class="mx-2">•</span>
              <span class="d-inline-flex flex-nowrap">
                {{ album.year }}
              </span>
            </template>
          </div>

          <div v-if="album.genres?.length" class="header-info-two">
            <span v-for="({ name: genre }, index) in album.genres" :key="genre">
              <span v-if="index > 0">, </span>
              <router-link :to="{ name: 'genre', params: { id: genre }}">
                {{ genre }}
              </router-link>
            </span>
          </div>
        </div>

        <div v-if="album.lastFmUrl || album.musicBrainzUrl">
          <span class="d-inline-flex flex-nowrap">
            <ExternalLink
              v-if="album.lastFmUrl"
              :href="album.lastFmUrl"
              class="btn btn-link p-0 me-2"
              title="Last.fm"
            >
              <IconLastFm />
            </ExternalLink>
            <ExternalLink
              v-if="album.musicBrainzUrl"
              :href="album.musicBrainzUrl"
              class="btn btn-link me-2 p-0"
              title="MusicBrainz"
            >
              <IconMusicBrainz />
            </ExternalLink>
          </span>
        </div>

        <div class="text-nowrap mt-3">
          <b-button variant="transparent" class="me-2" title="Shuffle" @click="shuffleNow">
            <Icon icon="shuffle" />
          </b-button>
          <b-button variant="transparent" class="me-2" title="Radio" @click="RadioNow">
            <Icon icon="radio" />
          </b-button>
          <b-button variant="transparent" class="me-2" title="Like" @click="toggleFavourite">
            <Icon :icon="isFavourite ? 'heart-fill' : 'heart'" />
          </b-button>
          <OverflowMenu direction="up" variant="transparent">
            <DropdownItem icon="plus" class="on-top" @click="setNextInQueue">
              Next
            </DropdownItem>
            <DropdownItem icon="plus" class="on-top" @click="addToQueue">
              Queue
            </DropdownItem>
            <DropdownItem v-if="!cached" icon="download" class="on-top" @click="cacheAlbum">
              Cache
            </DropdownItem>
            <DropdownItem v-if="cached" icon="trash" class="on-top" @click="clearAlbumCache">
              Cache
            </DropdownItem>
          </OverflowMenu>
        </div>
      </Custom>
    </div>
    <div class="content-wrapper">
      <TrackList
        :tracks="album.tracks || []"
        :no-album="true"
        :show-image="false"
        :no-artist="true"
      />
      <div v-if="album.description" class="row">
        <div class="d-inline-flex align-items-center mt3">
          <Icon icon="info" class="title-color me-2" />
          <span class="section-title">
            Background info
          </span>
        </div>
        <span class="d-flex justify-content-between adapt-text mb-2" style="text-align: justify;">
          {{ album.description }}
        </span>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
  import { defineComponent, ref, inject, computed } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlayerStore } from '@/player/store'
  import { useCacheStore } from '@/player/cache'
  import { useLoader } from '@/shared/loader'
  import { Album } from '@/shared/api'
  import TrackList from '@/library/track/TrackList.vue'
  import IconLastFm from '@/shared/components/IconLastFm.vue'
  import IconMusicBrainz from '@/shared/components/IconMusicBrainz.vue'
  import { useRouter, useRoute } from 'vue-router'

  export default defineComponent({
    components: { TrackList, IconLastFm, IconMusicBrainz },
    props: { id: { type: String, required: true } },
    setup(props) {
      const favouriteStore = useFavouriteStore()
      const playerStore = usePlayerStore()
      const cacheStore = useCacheStore()
      const api = inject('$api') as any
      const loader = useLoader()
      const router = useRouter()
      const route = useRoute()

      const album = ref<Album | null>(null)
      const cached = ref(false)

      const isFavourite = computed(() => favouriteStore.get('album', props.id))
      const isPlaying = computed(() => playerStore.isPlaying)

      // Fetch album details
      const fetchAlbum = async() => {
        loader.showLoading()
        try {
          const result = await api.getAlbumDetails(props.id)
          album.value = result
          if (album.value) {
            cached.value = await cacheStore.isCached(album.value)
          }
        } finally {
          loader.hideLoading()
        }
      }

      const playNow = () => {
        if (!album.value) return
        const currentTrack = playerStore.track
        const isAlbumTrack =
          !!currentTrack &&
          (currentTrack.albumId === album.value.id ||
            album.value.tracks?.some(t => t.id === currentTrack.id))
        if (isAlbumTrack) return playerStore.playPause()
        if (album.value.tracks?.length) return playerStore.playNow(album.value.tracks)
      }

      const shuffleNow = () => {
        if (!album.value || !album.value.tracks?.length) return
        return playerStore.shuffleNow(album.value.tracks)
      }

      const RadioNow = async() => {
        if (!album.value || !album.value.artists?.length) return
        playerStore.setShuffle(false)
        loader.showLoading()
        try {
          const artistId = album.value.artists[0].id
          const tracks = await api.getSimilarTracksByArtist(artistId, 50)
          if (!tracks?.length) return
          return playerStore.playNow(tracks)
        } finally {
          loader.hideLoading()
        }
      }

      const setNextInQueue = () => {
        if (album.value) {
          return playerStore.setNextInQueue(album.value.tracks!)
        }
      }

      const addToQueue = () => {
        if (album.value) {
          return playerStore.addToQueue(album.value.tracks!)
        }
      }

      const toggleFavourite = async() => {
        favouriteStore.toggle('album', props.id)
      }

      const cacheAlbum = async() => {
        if (album.value) {
          await cacheStore.cacheAlbum(album.value)
          cached.value = true
        }
      }

      const clearAlbumCache = async() => {
        if (!album.value) return
        await cacheStore.clearAlbumCache(album.value)
        cached.value = false
        router.replace({
          name: route.name as string,
          params: { ...(route.params || {}) },
          query: { ...(route.query || {}), t: Date.now().toString() },
        })
      }

      fetchAlbum()

      return {
        album,
        cached,
        favouriteStore,
        playerStore,
        cacheStore,
        isFavourite,
        isPlaying,
        playNow,
        shuffleNow,
        RadioNow,
        setNextInQueue,
        addToQueue,
        toggleFavourite,
        cacheAlbum,
        clearAlbumCache,
      }
    },
  })
</script>
