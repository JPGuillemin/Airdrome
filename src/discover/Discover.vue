<template>
  <ContentLoader :loading="loading">
    <div v-if="result.added.length > 0" class="mb-4">
      <h3>
        <router-link :to="{name: 'albums', params: {sort: 'recently-added'}}" class="text-muted">
          Recently Added
        </router-link>
      </h3>
      <AlbumList :items="result.added" allow-h-scroll />
    </div>
    <div v-if="result.genres.length > 0" class="mb-4">
      <h3>
        <router-link :to="{name: 'genres'}" class="text-muted">
          Genres
        </router-link>
      </h3>
      <div class="d-flex flex-wrap justify-content-center gap-1 gap-sm-2 gap-md-3">
        <span
          v-for="item in result.genres"
          :key="item.id"
          class="d-flex align-items-center justify-content-center text-bg-secondary rounded-pill"
          style="width: 105px; height: 36px; font-size: 0.70rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
        >
          <router-link
            :to="{name: 'genre', params: { id: item.id } }"
            class="text-decoration-none text-white d-block text-truncate"
            style="white-space: nowrap;"
          >
            {{ item.name }}
          </router-link>
        </span>
      </div>
    </div>
    <div v-if="result.random.length > 0" class="mb-4">
      <h3>
        <router-link :to="{name: 'albums', params: {sort: 'random'}}" class="text-muted">
          Random
        </router-link>
      </h3>
      <AlbumList :items="result.random" allow-h-scroll />
    </div>
    <div v-if="result.played.length > 0" class="mb-4">
      <h3>
        <router-link :to="{name: 'albums', params: {sort: 'recently-played'}}" class="text-muted">
          Recently Played
        </router-link>
      </h3>
      <AlbumList :items="result.played" allow-h-scroll />
    </div>
    <div v-if="result.most.length > 0" class="mb-4">
      <h3>
        <router-link :to="{name: 'albums', params: {sort: 'most-played'}}" class="text-muted">
          Most Played
        </router-link>
      </h3>
      <AlbumList :items="result.most" allow-h-scroll />
    </div>
    <EmptyIndicator v-if="empty" />
  </ContentLoader>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import AlbumList from '@/library/album/AlbumList.vue'
  import { Album, Genre } from '@/shared/api'
  import { orderBy } from 'lodash-es'

  export default defineComponent({
    components: {
      AlbumList,
    },
    data() {
      return {
        loading: true as boolean,
        result: {
          added: [] as Album[],
          played: [] as Album[],
          most: [] as Album[],
          random: [] as Album[],
          genres: [] as Genre[],
        }
      }
    },
    computed: {
      empty() {
        return Object.values(this.result).findIndex(x => x.length > 0) === -1
      }
    },
    created() {
      this.$api.getAlbums('recently-added', 15).then(result => {
        this.result.added = result
        this.loading = false
      })
      this.$api.getAlbums('recently-played', 15).then(result => {
        this.result.played = result
      })
      this.$api.getAlbums('most-played', 20).then(result => {
        this.result.most = result
      })
      this.$api.getAlbums('random', 25).then(result => {
        this.result.random = result
      })
      this.$api.getGenres().then(result => {
        this.result.genres = orderBy(result, 'name', 'asc')
      })
    }
  })
</script>
