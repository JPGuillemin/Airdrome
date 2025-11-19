<template>
  <div v-if="album" class="main-content">
    <div class="custom-wrapper">
      <Custom :image="album.image" :hover="'Play/Pause'" class="cursor-pointer" @click="playNow">
        <div class="custom-title-wrapper">
          <h1 class="custom-title">
            {{ album.name }}
          </h1>
        </div>

        <div class="custom-info-wrapper">
          <div class="custom-info-one">
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

          <div v-if="album.genres?.length" class="custom-info-two">
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
          <OverflowMenu variant="transparent" class="on-top">
            <DropdownItem icon="plus" @click="setNextInQueue">
              Next
            </DropdownItem>
            <DropdownItem icon="plus" @click="addToQueue">
              Queue
            </DropdownItem>
            <DropdownItem v-if="!cached" icon="download" @click="cacheAlbum">
              Cache
            </DropdownItem>
            <DropdownItem v-if="cached" icon="trash" @click="clearAlbumCache">
              Cache
            </DropdownItem>
          </OverflowMenu>
        </div>
      </Custom>
    </div>
    <div class="content-wrapper">
      <div class="row">
        <div class="col">
          <TrackList :tracks="album.tracks || []" :no-album="true" :show-image="false" :no-artist="true" />
        </div>
      </div>
      <div v-if="album.description" class="row">
        <h3 class="custom-title--secondary mt3">
          Background info
        </h3>
        <span class="d-flex justify-content-between adapt-text mb-2" style="text-align: justify;">
          {{ album.description }}
        </span>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import TrackList from '@/library/track/TrackList.vue'
  import { Album } from '@/shared/api'
  import { useFavouriteStore } from '@/library/favourite/store'
  import IconLastFm from '@/shared/components/IconLastFm.vue'
  import IconMusicBrainz from '@/shared/components/IconMusicBrainz.vue'
  import { usePlayerStore } from '@/player/store'
  import { useLoader } from '@/shared/loader'
  import { sleep } from '@/shared/utils'
  import { useCacheStore } from '@/player/cache'

  export default defineComponent({
    components: {
      IconMusicBrainz,
      IconLastFm,
      TrackList,
    },
    props: {
      id: { type: String, required: true }
    },
    setup() {
      return {
        favouriteStore: useFavouriteStore(),
        playerStore: usePlayerStore(),
        cacheStore: useCacheStore(),
      }
    },
    data() {
      return {
        album: null as Album | null,
        cached: false,
      }
    },
    computed: {
      isFavourite(): boolean {
        return this.favouriteStore.get('album', this.id)
      },
      isPlaying() { return this.playerStore.isPlaying },
    },
    async created() {
      const result = await this.$api.getAlbumDetails(this.id)
      this.album = result
      if (this.album) {
        this.cached = await this.cacheStore.isCached(this.album)
      }
    },
    methods: {
      playNow() {
        const album = this.album
        if (!album) return
        const currentTrack = this.playerStore.track
        const isAlbumTrack =
          !!currentTrack && (currentTrack.albumId === album.id || album.tracks?.some(t => t.id === currentTrack.id))
        if (isAlbumTrack) return this.playerStore.playPause()
        if (album.tracks?.length) return this.playerStore.playNow(album.tracks)
      },
      shuffleNow() {
        const album = this.album
        if (!album || !album.tracks?.length) return
        return this.playerStore.shuffleNow(album.tracks)
      },
      async RadioNow() {
        const album = this.album
        if (!album || !album.artists?.length) {
          console.warn('No album or artist information available for radio mode.')
          return
        }
        this.playerStore.setShuffle(false)
        const loader = useLoader()
        loader.showLoading()
        try {
          const artistId = album.artists[0].id
          const tracks = await this.$api.getSimilarTracksByArtist(artistId, 50)
          if (!tracks?.length) {
            console.warn(`No similar tracks found for artist ${album.artists[0].name}`)
            return
          }
          return this.playerStore.playNow(tracks)
        } finally {
          loader.hideLoading()
        }
      },
      setNextInQueue() {
        if (this.album) {
          return this.playerStore.setNextInQueue(this.album.tracks!)
        }
      },
      addToQueue() {
        if (this.album) {
          return this.playerStore.addToQueue(this.album.tracks!)
        }
      },
      async toggleFavourite() {
        this.favouriteStore.toggle('album', this.id)
        await sleep(300)
        const album = this.album
        if (!album) return
        if (this.isFavourite) {
          await this.cacheAlbum()
        } else {
          await this.clearAlbumCache()
        }
      },
      async cacheAlbum() {
        if (this.album) {
          await this.cacheStore.cacheAlbum(this.album)
        }
      },
      async clearAlbumCache() {
        if (this.album) {
          await this.cacheStore.clearAlbumCache(this.album)
          // Refresh page
          this.$router.replace({
            name: this.$route.name as string,
            params: { ...(this.$route.params || {}) },
            query: { ...(this.$route.query || {}), t: Date.now().toString() }
          })
        }
      },
    },
  })
</script>
