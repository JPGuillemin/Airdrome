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
      <div class="pill-container">
        <span v-for="item in result.genres" :key="item.id" class="pill">
          <router-link :to="{ name: 'genre', params: { id: item.id } }" class="pill-link">
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
    <div v-if="result.random.length > 0" class="mb-4">
      <h3>
        <router-link :to="{name: 'albums', params: {sort: 'random'}}" class="text-muted">
          Random
        </router-link>
      </h3>
      <AlbumList :items="result.random" allow-h-scroll />
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
      this.$api.getAlbums('recently-added', 18).then(result => {
        this.result.added = result
        this.loading = false
      })
      this.$api.getAlbums('recently-played', 18).then(result => {
        this.result.played = result
      })
      this.$api.getAlbums('most-played', 23).then(result => {
        this.result.most = result
      })
      this.$api.getAlbums('random', 28).then(result => {
        this.result.random = result
      })
      this.$api.getGenres().then(result => {
        this.result.genres = orderBy(result, 'name', 'asc')
      })
    }
  })
</script>

.pill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  justify-content: center;
  gap: 6px; /* slightly larger minimum gap */
  padding: 1rem;
}

@media (min-width: 600px) {
  .pill-grid {
    gap: 12px;
  }
}

@media (min-width: 992px) {
  .pill-grid {
    gap: 18px;
  }
}
<style lang="scss" scoped>
  /* Base: mobile-first scrollable line */
  .pill-container {
    display: flex;
    overflow-x: auto;
    white-space: nowrap;
    gap: 8px;
    padding: 0.5rem 1rem;
    scrollbar-width: none; /* Firefox */
  }
  .pill-container::-webkit-scrollbar {
    display: none; /* Chrome, Safari */
  }

  /* Pills style (common) */
  .pill {
    background-color: #6c757d;
    border-radius: 50px;
    flex: 0 0 auto;
    padding: 0.5rem 1rem;
    height: 36px;
    font-size: 0.8rem;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pill-link {
    color: white;
    text-decoration: none;
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Switch to grid on larger screens */
  @media (min-width: 768px) {
    .pill-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, auto));
    gap: 12px;
    justify-content: center;
    overflow: visible;
    white-space: normal;
    }

    .pill {
    flex: unset;
    }
  }
</style>
