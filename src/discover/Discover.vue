<template>
  <div class="main-content">
    <ContentLoader :loading="loading">
      <div v-if="result.favalbums.length > 0" class="mb-4">
        <h3>
          Favourite albums
          <router-link :to="{name: 'favourites'}" class="text-muted">
            <Icon icon="chevron-right" />
          </router-link>
        </h3>
        <AlbumList :items="result.favalbums" allow-h-scroll />
      </div>

      <div v-if="result.favartists.length > 0" class="mb-4">
        <h3>
          Favourite artists
          <router-link :to="{name: 'favourites', params: { section: 'artists' }}" class="text-muted">
            <Icon icon="chevron-right" />
          </router-link>
        </h3>
        <ArtistList :items="result.favartists" allow-h-scroll />
      </div>

      <div v-if="result.genres.length > 0" class="mb-4">
        <h3>Genres</h3>
        <div
          class="d-flex gap-2 px-2 py-2 px-md-0 flex-nowrap flex-md-wrap overflow-auto overflow-md-visible"
          style="scrollbar-width: none; -ms-overflow-style: none;">
          <span
            v-for="item in result.genres"
            :key="item.id"
            class="text-bg-secondary rounded-pill py-3 px-2 flex-shrink-0 text-truncate text-center align-items-center justify-content-center"
            style="width: 100px;">
            <router-link
              :to="{name: 'genre', params: { id: item.id } }"
              class="text-decoration-none"
              style="color: var(--bs-primary) !important;">
              {{ item.name }}
            </router-link>
          </span>
        </div>
      </div>

      <div v-for="section in sections" :key="section.key" class="mb-4 main-content">
        <template v-if="result[section.key].length > 0">
          <h3>
            {{ section.name }}
            <router-link
              :to="{name: 'albums', params: {sort: section.key}}"
              class="text-muted"
            >
              <Icon icon="chevron-right" />
            </router-link>
          </h3>
          <AlbumList :items="result[section.key]" allow-h-scroll />
        </template>
      </div>

      <div v-if="result.random.length > 0" class="mb-4">
        <h3>
          Random
          <router-link :to="{name: 'albums', params: {sort: 'random'}}" class="text-muted">
            <Icon icon="chevron-right" />
          </router-link>
        </h3>
        <AlbumList :items="result.random" allow-h-scroll />
      </div>

      <EmptyIndicator v-if="empty" />
    </ContentLoader>
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import { Album, Genre, Artist } from '@/shared/api'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import { orderBy } from 'lodash-es'

  export default defineComponent({
    components: {
      AlbumList,
      ArtistList,
    },
    data() {
      return {
        loading: true as boolean,
        result: {
          'recently-added': [] as Album[],
          'recently-played': [] as Album[],
          'most-played': [] as Album[],
          random: [] as Album[],
          favalbums: [] as Album[],
          favartists: [] as Artist[],
          genres: [] as Genre[],
        }
      }
    },
    computed: {
      sections(): any[] {
        return [
          { name: 'Recently added', key: 'recently-added' },
          { name: 'Recently played', key: 'recently-played' },
          { name: 'Most played', key: 'most-played' },
        ]
      },
      empty() {
        return Object.values(this.result).findIndex(x => x.length > 0) === -1
      }
    },
    created() {
      const size = 18
      this.$api.getAlbums('recently-added', size).then(result => {
        this.result['recently-added'] = result
        this.loading = false
      })
      this.$api.getAlbums('recently-played', size).then(result => {
        this.result['recently-played'] = result
      })
      this.$api.getAlbums('most-played', size).then(result => {
        this.result['most-played'] = result
      })
      this.$api.getAlbums('random', 24).then(result => {
        this.result.random = result
      })
      this.$api.getFavourites().then(result => {
        this.result.favalbums = result.albums.slice(0, 18)
        this.result.favartists = result.artists.slice(0, 18)
      })
      this.$api.getGenres().then(result => {
        this.result.genres = orderBy(result, 'albumCount', 'desc')
      })
    }
  })
</script>
