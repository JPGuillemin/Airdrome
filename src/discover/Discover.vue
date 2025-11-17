<template>
  <div class="main-content">
    <div v-if="result.genres.length > 0" class="pb-2 pt-3">
      <div class="d-flex gap-3 overflow-auto scroll-adapt">
        <router-link
          v-for="item in result.genres"
          :key="item.id"
          :to="{ name: 'genre', params: { id: item.id } }"
          class="text-decoration-none"
          style="color: var(--theme-text-muted); white-space: nowrap; font-weight: bold;"
        >
          {{ item.name }}
        </router-link>
      </div>
    </div>

    <div v-if="result.playlists.length > 0" class="pb-2">
      <router-link :to="{ name: 'playlists' }" class="text-muted">
        <h1 class="poster-title">
          Playlists
        </h1>
      </router-link>
      <PlaylistList :items="result.playlists" allow-h-scroll />
    </div>

    <div v-if="result.played.length > 0" class="pb-2">
      <router-link :to="{ name: 'albums', params: { sort: 'recently-played' } }" class="text-muted">
        <h1 class=" poster-title">
          Recently played
        </h1>
      </router-link>
      <AlbumList :items="result.played" allow-h-scroll />
    </div>

    <div v-if="result.favartists.length > 0" class="pb-2">
      <router-link :to="{ name: 'favourites', params: { section: 'artists' } }" class="text-muted">
        <h1 class="poster-title">
          Fav artists
        </h1>
      </router-link>
      <ArtistList :items="result.favartists" allow-h-scroll />
    </div>

    <div v-if="result.favalbums.length > 0" class="pb-2">
      <router-link :to="{ name: 'favourites' }" class="text-muted">
        <h1 class="poster-title">
          Fav albums
        </h1>
      </router-link>
      <AlbumList :items="result.favalbums" allow-h-scroll />
    </div>

    <div v-if="result.random.length > 0" class="pb-2">
      <router-link :to="{ name: 'albums', params: { sort: 'random' } }" class="text-muted">
        <h1 class=" poster-title">
          Random
        </h1>
      </router-link>
      <AlbumList :items="result.random" allow-h-scroll />
    </div>

    <div v-if="result.recent.length > 0" class="pb-2">
      <router-link :to="{ name: 'albums', params: { sort: 'recently-added' } }" class="text-muted">
        <h1 class=" poster-title">
          Recently added
        </h1>
      </router-link>
      <AlbumList :items="result.recent" allow-h-scroll />
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import PlaylistList from '@/library/playlist/PlaylistList.vue'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import { Album, Genre, Artist, Playlist } from '@/shared/api'
  import { orderBy } from 'lodash-es'

  export default defineComponent({
    components: {
      AlbumList,
      ArtistList,
      PlaylistList,
    },
    data() {
      return {
        loading: false,
        result: {
          recent: [] as Album[],
          played: [] as Album[],
          random: [] as Album[],
          favalbums: [] as Album[],
          favartists: [] as Artist[],
          genres: [] as Genre[],
          playlists: [] as Playlist[],
        },
      }
    },
    computed: {
      empty() {
        return Object.values(this.result).findIndex(x => x.length > 0) === -1
      },
    },
    mounted() {
      this.fetchData()
    },
    methods: {
      async fetchData() {
        const size = 15
        if (this.loading) return
        this.loading = true
        try {
          const [recent, played, random, favourites, genres, playlists] = await Promise.all([
            this.$api.getAlbums('recently-added', size),
            this.$api.getAlbums('recently-played', size),
            this.$api.getAlbums('random', size),
            this.$api.getFavourites(),
            this.$api.getGenres(),
            this.$api.getPlaylists(),
          ])

          const genreNames = genres.map((genre: Genre) => ({
            ...genre,
            id: genre.name,
          }))

          this.result.recent = recent
          this.result.played = played
          this.result.random = random
          this.result.favalbums = favourites.albums.slice(0, size)
          this.result.favartists = favourites.artists.slice(0, size)
          this.result.genres = orderBy(genreNames, 'albumCount', 'desc')
          this.result.playlists = playlists.slice(0, size)
        } finally {
          this.loading = false
        }
      },
    },
  })
</script>

<style scoped>
  .poster-title {
    margin-top: 10px;
    font-size: 1.5rem;
  }

  .scroll-adapt {
    /* Default: show scrollbar on desktop */
    overflow-x: auto;
    scrollbar-color: rgba(0, 0, 0, 0.3) transparent; /* Firefox */
  }

  /* WebKit browsers (Chrome, Safari, Edge) */
  .scroll-adapt::-webkit-scrollbar {
    height: 20px; /* horizontal scrollbar thickness */
  }

  .scroll-adapt::-webkit-scrollbar-button {
    display: none; /* remove arrows */
  }

  .scroll-adapt::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.3);
    border-radius: 10px;
  }

  .scroll-adapt::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 10px;
  }

  /* Mobile: hide scrollbar */
  @media (max-width: 654px) {
    .scroll-adapt {
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE 10+ */
    }
    .scroll-adapt::-webkit-scrollbar {
      display: none; /* Chrome, Safari, Opera */
    }
  }
</style>
