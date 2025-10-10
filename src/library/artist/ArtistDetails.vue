<template>
  <div class="main-content">
    <Hero :image="artist.image">
      <small>Artist</small>
      <h1 class="display-5 fw-bold">
        {{ artist.name }}
      </h1>
      <div class="d-flex flex-wrap align-items-center">
        <span class="text-nowrap">
          <strong>{{ artist.albumCount }}</strong> albums
        </span>
        <span class="mx-2">•</span>
        <span class="text-nowrap">
          <strong>{{ artist.trackCount }}</strong> tracks
        </span>

        <template v-if="artist.genres.length > 0">
          <span class="mx-2">•</span>
          <span v-for="({ name: genre }, index) in artist.genres" :key="genre">
            <span v-if="index > 0">, </span>
            <router-link :to="{name: 'genre', params: { id: genre }}">
              {{ genre }}
            </router-link>
          </span>
        </template>

        <template v-if="artist.lastFmUrl || artist.musicBrainzUrl">
          <span class="mx-2">•</span>
          <div class="d-flex flex-nowrap">
            <ExternalLink v-if="artist.lastFmUrl" :href="artist.lastFmUrl" class="btn btn-link p-0 me-2" title="Last.fm">
              <IconLastFm />
            </ExternalLink>
            <ExternalLink v-if="artist.musicBrainzUrl" :href="artist.musicBrainzUrl" class="btn btn-link me-2 p-0" title="MusicBrainz">
              <IconMusicBrainz />
            </ExternalLink>
          </div>
        </template>
      </div>

      <OverflowFade v-if="artist.description" class="mt-3">
        {{ artist.description }}
      </OverflowFade>

      <div class="text-nowrap mt-3">
        <b-button
          v-if="artist.trackCount > 0"
          variant="transparent"
          class="me-2"
          title="Shuffle"
          @click="shuffleNow">
          <Icon icon="shuffle" />
        </b-button>
        <b-button
          v-if="artist.trackCount > 0"
          variant="transparent"
          class="me-2"
          title="Favourite"
          @click="toggleFavourite">
          <Icon :icon="isFavourite ? 'heart-fill' : 'heart'" />
        </b-button>
        <template v-if="artist.similarArtist.length > 0">
          <b-button
            v-if="artist.trackCount > 0"
            variant="transparent"
            class="me-2"
            title="Radio"
            @click="RadioNow">
            <Icon icon="radio" />
          </b-button>
        </template>
      </div>
    </Hero>

    <template v-if="artist.topTracks.length > 0">
      <div class="d-flex justify-content-between mt-5 mb-2">
        <h3 class="my-0">
          Top tracks
        </h3>
        <router-link :to="{name: 'artist-tracks', params: { id }}">
          View all
        </router-link>
      </div>
      <TrackList :tracks="artist.topTracks" no-artist />
    </template>

    <template v-for="({ releaseType, albums: releaseTypeAlbums }) in albums">
      <div :key="`${releaseType}-h`" class="d-flex justify-content-between mt-5 mb-2">
        <h3 class="my-0">
          {{ formatReleaseType(releaseType) }}
        </h3>
        <b-button variant="link" class="p-0" @click="toggleAlbumSortOrder">
          <Icon icon="arrow-up-down" />
        </b-button>
      </div>
      <AlbumList :key="`${releaseType}-body`" :items="releaseTypeAlbums">
        <template #text="{ year }">
          {{ year || 'Unknown' }}
        </template>
      </AlbumList>
    </template>

    <template v-if="artist.similarArtist.length > 0">
      <h3 class="mt-5">
        Similar artists
      </h3>
      <ArtistList :items="artist.similarArtist" />
    </template>
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import TrackList from '@/library/track/TrackList.vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import OverflowFade from '@/shared/components/OverflowFade.vue'
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
      OverflowFade,
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
        return !!this.favouriteStore.artists[this.id]
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
      const loader = useLoader()
      loader.showLoading()
      Promise.all([
        this.$api.getArtistDetails(this.id).then(result => {
          this.artist = result
        }),
      ])
        .finally(() => {
          loader.hideLoading()
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
      }
    }
  })
</script>
