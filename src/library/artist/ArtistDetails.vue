<template>
  <div v-if="artist" class="main-content">
    <div class="poster-wrapper">
      <Poster :image="artist.image" :hover="'Play/Pause'" class="cursor-pointer" @click="shuffleNow">
        <div class="poster-title-wrapper">
          <h1 class="poster-title">
            {{ artist.name }}
          </h1>
        </div>

        <div class="poster-info-wrapper">
          <div class="poster-info-one">
            <span class="text-nowrap">
              <strong>{{ artist.albumCount }}</strong> albums
            </span>
            <span class="mx-2">•</span>
            <span class="text-nowrap">
              <strong>{{ artist.trackCount }}</strong> tracks
            </span>
          </div>

          <div class="poster-info-two">
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
          <b-button v-if="artist.trackCount > 0" variant="transparent" class="me-2" title="Shuffle" @click="shuffleNow">
            <Icon icon="shuffle" />
          </b-button>
          <b-button v-if="artist.trackCount > 0" variant="transparent" class="me-2" title="Radio" @click="RadioNow">
            <Icon icon="radio" />
          </b-button>
          <b-button v-if="artist.trackCount > 0" variant="transparent" class="me-2" title="Like" @click="toggleFavourite">
            <Icon :icon="isFavourite ? 'heart-fill' : 'heart'" />
          </b-button>
          <b-button v-if="artist.similarArtist.length > 0" variant="transparent" class="me-2" title="Go to Top Tracks" @click="scrollToSection('similarArtists')">
            <Icon icon="artists" />
          </b-button>
        </div>
      </Poster>
    </div>
    <div class="content-wrapper">
      <template v-if="artist.topTracks.length > 0">
        <div class="d-flex justify-content-between mt-3 mb-2">
          <h3 ref="topTracks" class="poster-title--secondary">
            Top tracks
          </h3>
          <router-link :to="{name: 'artist-tracks', params: { id }}">
            View all
          </router-link>
        </div>
        <TrackList :tracks="artist.topTracks" no-artist />
      </template>
      <div v-for="({ releaseType, albums: releaseTypeAlbums }) in albums" :key="releaseType">
        <div class="d-flex justify-content-between mt-3 mb-2">
          <h3 class="poster-title--secondary">
            {{ formatReleaseType(releaseType) }}
          </h3>
          <b-button variant="link" class="p-0" @click="toggleAlbumSortOrder">
            <Icon icon="arrow-up-down" />
          </b-button>
        </div>
        <AlbumList :items="releaseTypeAlbums">
          <template #text="{ year }">
            {{ year || 'Unknown' }}
          </template>
        </AlbumList>
      </div>
      <template v-if="artist.similarArtist.length > 0">
        <h3 ref="similarArtists" class="poster-title--secondary mt-3">
          Similar artists
        </h3>
        <ArtistList :items="artist.similarArtist" />
      </template>
      <template v-if="artist.description">
        <h3 class="poster-title--secondary mt-3">
          Background info
        </h3>
        <span class="d-flex justify-content-between mb-2" style="text-align: justify;">
          {{ artist.description }}
        </span>
      </template>
    </div>
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import TrackList from '@/library/track/TrackList.vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { Album } from '@/shared/api'
  import { groupBy, orderBy } from 'lodash-es'
  import { useMainStore } from '@/shared/store'
  import IconLastFm from '@/shared/components/IconLastFm.vue'
  import IconMusicBrainz from '@/shared/components/IconMusicBrainz.vue'
  import { usePlayerStore } from '@/player/store'
  import type { Track } from '@/shared/api'
  import { useLoader } from '@/shared/loader'

  export default defineComponent({
    components: {
      IconMusicBrainz,
      IconLastFm,
      AlbumList,
      ArtistList,
      TrackList,
    },
    props: {
      id: { type: String, required: true }
    },
    setup() {
      return {
        mainStore: useMainStore(),
        favouriteStore: useFavouriteStore(),
        playerStore: usePlayerStore(),
      }
    },
    data() {
      return {
        artist: null as any,
      }
    },
    computed: {
      isFavourite(): boolean {
        return this.favouriteStore.get('artist', this.id)
      },
      albums(): { releaseType: string, albums: Album[] }[] {
        const sorted: Album[] = orderBy(
          this.artist?.albums ?? [],
          ['year', 'name'],
          [this.mainStore.artistAlbumSortOrder, this.mainStore.artistAlbumSortOrder]
        )
        const grouped = groupBy(sorted, 'releaseType')
        const groupOrder = ['ALBUM', 'EP', 'SINGLE']
        const groups = Object.entries(grouped).sort(([aType], [bType]) => {
          const [a, b] = [groupOrder.indexOf(aType), groupOrder.indexOf(bType)]
          if (a === -1 && b === -1) return 0
          if (a === -1) return 1
          if (b === -1) return -1
          return a - b
        })
        return groups.map(([releaseType, albums]) => ({ releaseType, albums: albums || [] }))
      },
    },
    created() {
      this.$api.getArtistDetails(this.id).then(result => {
        this.artist = result
      })
    },
    methods: {
      formatReleaseType(value: string) {
        switch (value.toUpperCase()) {
        case 'ALBUM': return 'Albums'
        case 'EP': return 'EPs'
        case 'SINGLE': return 'Singles'
        case 'COMPILATION': return 'Compilations'
        default: return value
        }
      },
      async shuffleNow() {
        const loader = useLoader()
        loader.showLoading()
        try {
          const tracks: Track[] = []
          for await (const batch of this.$api.getTracksByArtist(this.id)) {
            tracks.push(...batch)
          }
          return this.playerStore.shuffleNow(tracks)
        } finally {
          loader.hideLoading()
        }
      },
      async RadioNow() {
        this.playerStore.setShuffle(false)
        const loader = useLoader()
        loader.showLoading()
        try {
          const tracks = await this.$api.getSimilarTracksByArtist(this.id, 50)
          return this.playerStore.playNow(tracks)
        } finally {
          loader.hideLoading()
        }
      },
      toggleFavourite() {
        return this.favouriteStore.toggle('artist', this.id)
      },
      toggleAlbumSortOrder() {
        this.mainStore.toggleArtistAlbumSortOrder()
      },
      scrollToSection(refName: string) {
        this.$nextTick(() => {
          const section = this.$refs[refName] as HTMLElement | undefined
          if (!section) return

          // Adjust this to match poster height
          const posterHeight = 230

          const top = section.getBoundingClientRect().top + window.scrollY - posterHeight

          window.scrollTo({
            top,
            behavior: 'smooth',
          })
        })
      },
    }
  })
</script>
