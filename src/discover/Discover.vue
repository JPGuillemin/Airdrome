<template>
  <div class="main-content">
    <div v-if="result.genres.length > 0" class="section-wrapper pt-3">
      <div
        v-wheel-scroll="{ enabled: allowHScroll, speed: 0.9, friction: 0.88 }"
        class="d-flex gap-3 overflow-auto scroll"
      >
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

    <div v-if="result.favartists.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'favourites', params: { section: 'artists' } }" class="d-inline-flex align-items-center">
          <Icon icon="heart" class="title-color me-2" />
          <span class="section-title">Fav artists</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Favourite Artists Radio"
          @click="radioFavouriteArtists()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <ArtistList :items="result.favartists" tile-size="120" allow-h-scroll />
    </div>

    <div v-if="result.mood.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'genre', params: { id: lastGenre.name } }" class="d-inline-flex align-items-center">
          <Icon icon="genres" class="title-color me-2" />
          <span class="section-title">Current mood</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Current Mood Radio"
          @click="radioMood()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <AlbumList :items="result.mood" tile-size="45" allow-h-scroll three-rows />
    </div>

    <div v-if="result.recent.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'albums', params: { sort: 'recently-added' } }" class="d-inline-flex align-items-center">
          <Icon icon="new" class="title-color me-2" />
          <span class="section-title">Recently added</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Recently added Radio"
          @click="radioRecentlyAdded()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <AlbumList :items="result.recent" tile-size="120" allow-h-scroll />
    </div>

    <div v-if="result.favalbums.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'favourites' }" class="d-inline-flex align-items-center">
          <Icon icon="heart" class="title-color me-2" />
          <span class="section-title">Fav albums</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Favourite Albums Radio"
          @click="radioFavouriteAlbums()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <AlbumList :items="result.favalbums" tile-size="120" allow-h-scroll />
    </div>

    <div v-if="result.playlists.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'playlists' }" class="d-inline-flex align-items-center">
          <Icon icon="playlist" class="title-color me-2" />
          <span class="section-title">Playlists</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Global Radio"
          @click="luckyRadio()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <PlaylistList :items="result.playlists" tile-size="120" allow-h-scroll />
    </div>

    <div v-if="result.random.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'albums', params: { sort: 'random' } }" class="d-inline-flex align-items-center">
          <Icon icon="random" class="title-color me-2" />
          <span class="section-title">Get lucky</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Random play"
          @click="luckyRadio()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <AlbumList :items="result.random" tile-size="45" allow-h-scroll three-rows />
    </div>

    <div v-if="result.played.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'albums', params: { sort: 'recently-played' } }" class="d-inline-flex align-items-center">
          <Icon icon="recent" class="title-color me-2" />
          <span class="section-title">Recently played</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Recently Played Radio"
          @click="radioRecentlyPlayed()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <AlbumList :items="result.played" tile-size="120" allow-h-scroll />
    </div>

    <div v-if="result.most.length > 0" class="section-wrapper">
      <div class="d-flex align-items-center justify-content-between">
        <router-link :to="{ name: 'albums', params: { sort: 'most-played' } }" class="d-inline-flex align-items-center">
          <Icon icon="most" class="title-color me-2" />
          <span class="section-title">Most Played</span>
        </router-link>
        <b-button
          v-longpress-tooltip
          variant="transparent"
          class="me-2"
          title="Most Played Radio"
          @click="radioMostPlayed()"
        >
          <Icon icon="radio" />
        </b-button>
      </div>
      <AlbumList :items="result.most" tile-size="120" allow-h-scroll />
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref, computed, onMounted, watch, inject } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import PlaylistList from '@/library/playlist/PlaylistList.vue'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import { Album, AlbumGenre, Genre, Artist, Playlist } from '@/shared/api'
  import { orderBy } from 'lodash-es'
  import { reloadToken } from '@/shared/reload'
  import { useRadioStore } from '@/player/radio'
  import { longPressTooltip } from '@/shared/tooltips'

  export default defineComponent({
    components: {
      AlbumList,
      ArtistList,
      PlaylistList,
    },

    directives: {
      'longpress-tooltip': longPressTooltip
    },

    setup() {
      const api = inject('$api') as any

      const loading = ref(false)
      const result = ref({
        recent: [] as Album[],
        played: [] as Album[],
        mood: [] as Album[],
        most: [] as Album[],
        favalbums: [] as Album[],
        favartists: [] as Artist[],
        genres: [] as Genre[],
        playlists: [] as Playlist[],
        random: [] as Album[],
      })

      const lastGenre = ref<AlbumGenre | null>(null)

      const empty = computed(() =>
        Object.values(result.value).findIndex(x => x.length > 0) === -1
      )

      const fetchData = async() => {
        if (loading.value) return
        loading.value = true

        try {
          api.getGenres().then((genres: Genre[]) => {
            const genreNames = genres.map((genre: Genre) => ({ ...genre, id: genre.name }))
            result.value.genres = orderBy(genreNames, 'albumCount', 'desc')
          })

          api.getFavourites().then(favourites => {
            result.value.favartists = favourites.artists.slice(0, 16)
            result.value.favalbums = favourites.albums.slice(0, 16)
          })

          api.getAlbums('recently-played', 32).then(async played => {
            result.value.played = played
            if (played.length === 0) return

            const lastPlayed = played[0]
            lastGenre.value = (lastPlayed as Album).genres[0]!
            if (!lastGenre.value) return
            const shuffled = true
            const albumsByGenre = await api.getAlbumsByGenre(lastGenre.value.name, 72, 0, shuffled)
            result.value.mood = albumsByGenre
          })

          api.getAlbums('recently-added', 32).then(recent => {
            result.value.recent = recent
          })

          const playlists = await api.getPlaylists()
          result.value.playlists = playlists.slice(0, 10)

          api.getAlbums('random', 32).then(random => {
            result.value.random = random
          })

          api.getAlbums('most-played', 32).then(most => {
            result.value.most = most
          })
        } finally {
          loading.value = false
        }
      }

      const radio = useRadioStore()
      const radioRecentlyPlayed = () => radio.shuffleRecentlyPlayed()
      const radioMostPlayed = () => radio.shuffleMostPlayed()
      const radioFavouriteAlbums = () => radio.shuffleFavouriteAlbums()
      const radioFavouriteArtists = () => radio.shuffleFavouriteArtists()
      const radioRecentlyAdded = () => radio.shuffleRecentlyAdded()
      const luckyRadio = () => radio.luckyRadio()
      const radioMood = () =>
        lastGenre.value
          ? radio.shuffleMood(lastGenre.value.name)
          : undefined

      onMounted(fetchData)

      function emptyResult() {
        Object.assign(result.value, {
          recent: [],
          played: [],
          mood: [],
          most: [],
          favalbums: [],
          favartists: [],
          genres: [],
          playlists: [],
          random: [],
        })
      }

      watch(reloadToken, () => {
        emptyResult()
        fetchData()
      })

      return {
        result,
        lastGenre,
        loading,
        empty,
        fetchData,
        radioRecentlyPlayed,
        radioMostPlayed,
        radioFavouriteAlbums,
        radioFavouriteArtists,
        radioRecentlyAdded,
        radioMood,
        luckyRadio,
      }
    },
  })
</script>

<style scoped>
  .header-title {
    margin-top: 10px;
    font-size: 1.5rem;
  }
</style>
