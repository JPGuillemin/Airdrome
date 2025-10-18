<template>
  <div class="main-content">
    <Hero v-if="album" :image="album.image" class="cursor-pointer" @click="playNow">
      <small>Album</small>
      <h1 class="display-5 fw-bold">
        {{ album.name }}
      </h1>
      <div class="d-flex flex-wrap align-items-center">
        <div>
          by
          <span v-for="(artist, index) in album.artists" :key="artist.id">
            <span v-if="index > 0">, </span>
            <router-link :to="{name: 'artist', params: { id: artist.id }}">
              {{ artist.name }}
            </router-link>
          </span>
        </div>

        <template v-if="album.year">
          <span class="mx-2">•</span> {{ album.year }}
        </template>

        <template v-if="album.genres.length">
          <span class="mx-2">•</span>
          <span v-for="({ name: genre }, index) in album.genres" :key="genre">
            <span v-if="index > 0">, </span>
            <router-link :to="{name: 'genre', params: { id: genre }}">
              {{ genre }}
            </router-link>
          </span>
        </template>

        <template v-if="album.lastFmUrl || album.musicBrainzUrl">
          <span class="mx-2">•</span>
          <div class="d-flex flex-nowrap">
            <ExternalLink v-if="album.lastFmUrl" :href="album.lastFmUrl" class="btn btn-link p-0 me-2" title="Last.fm">
              <IconLastFm />
            </ExternalLink>
            <ExternalLink v-if="album.musicBrainzUrl" :href="album.musicBrainzUrl" class="btn btn-link me-2 p-0" title="MusicBrainz">
              <IconMusicBrainz />
            </ExternalLink>
          </div>
        </template>
      </div>

      <OverflowFade v-if="album.description" class="mt-3">
        {{ album.description }}
      </OverflowFade>

      <div class="text-nowrap mt-3">
        <b-button variant="transparent" class="me-2" title="Shuffle" @click="shuffleNow">
          <Icon icon="shuffle" />
        </b-button>
        <b-button variant="transparent" class="me-2" title="Radio" @click="RadioNow">
          <Icon icon="radio" />
        </b-button>
        <b-button variant="transparent" class="me-2" title="Favourite" @click="toggleFavourite">
          <Icon :icon="isFavourite ? 'heart-fill' : 'heart'" />
        </b-button>
        <OverflowMenu variant="transparent">
          <DropdownItem icon="plus" @click="setNextInQueue">
            Play next
          </DropdownItem>
          <DropdownItem icon="plus" @click="addToQueue">
            Add to queue
          </DropdownItem>
        </OverflowMenu>
      </div>
    </Hero>
    <div class="row">
      <div class="col">
        <TrackList :tracks="album.tracks" no-album />
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
  import OverflowFade from '@/shared/components/OverflowFade.vue'
  import { usePlayerStore } from '@/player/store'
  import { useLoader } from '@/shared/loader'

  export default defineComponent({
    components: {
      OverflowFade,
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
      }
    },
    data() {
      return {
        album: null as null | Album,
      }
    },
    computed: {
      isFavourite(): boolean {
        return !!this.favouriteStore.albums[this.id]
      },
      isPlaying() { return this.playerStore.isPlaying },
    },
    created() {
      const loader = useLoader()
      loader.showLoading()
      Promise.all([
        this.$api.getAlbumDetails(this.id).then(result => {
          this.album = result
        }),
      ])
        .finally(() => {
          loader.hideLoading()
        })
    },
    methods: {
      playNow() {
        const album = this.album
        const currentTrack = this.playerStore.track
        if (!album) return
        const isAlbumTrack =
          !!currentTrack && (currentTrack.albumId === album.id || album.tracks?.some(t => t.id === currentTrack.id))
        if (isAlbumTrack) {
          return this.playerStore.playPause()
        }
        return this.playerStore.playNow(this.album!.tracks!)
      },

      shuffleNow() {
        return this.playerStore.shuffleNow(this.album!.tracks!)
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
      toggleFavourite() {
        return this.favouriteStore.toggle('album', this.id)
      },
    }
  })
</script>
