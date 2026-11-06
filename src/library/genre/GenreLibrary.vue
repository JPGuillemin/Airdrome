// GenreLibrary.vue
<template>
  <div class="main-content">
    <div class="d-flex align-items-center justify-content-between mt-3">
      <div class="d-inline-flex align-items-center">
        <Icon icon="genres" class="title-color me-2" />
        <span class="main-title">
          Genres
        </span>
      </div>
      <ul class="nav adapt-text">
        <li>
          <router-link :to="sizeRoute">
            <Icon icon="most" />
          </router-link>
        </li>
        <li>
          <router-link :to="azRoute">
            A-z
          </router-link>
        </li>
        <li>
          <router-link :to="cloudRoute">
            <Icon icon="cloud" />
          </router-link>
        </li>
      </ul>
    </div>
    <div v-if="sortedItems.length > 0">
      <!-- CLOUD MODE -->
      <GenreCloud
        v-if="sort === 'cloud'"
        :items="sortedItems"
      />

      <!-- NORMAL MODE -->
      <template v-else>
        <div
          v-for="item in sortedItems"
          :key="item.id"
          class="section-wrapper"
        >
          <div class="d-flex align-items-center justify-content-between">
            <router-link
              :to="{ name: 'genre', params: { id: item.id } }"
              class="d-inline-flex align-items-center"
            >
              <span class="section-title">
                {{ item.name }} - {{ item.albumCount }}
              </span>

              <Icon icon="albums" class="title-color xsmall ms-1" />
            </router-link>

            <b-button
              v-longpress-tooltip
              variant="transparent"
              class="me-2"
              title="Genre Radio"
              @click="radio.shuffleGenre(item.id)"
            >
              <Icon icon="radio" />
            </b-button>
          </div>

          <ArtistList
            :items="item.artists"
            :allow-h-scroll="true"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script>
  import { defineComponent, ref, computed, watch, inject } from 'vue'
  import { orderBy } from 'lodash-es'
  import ArtistList from '@/library/artist/ArtistList.vue'
  import GenreCloud from './GenreCloud.vue'
  import { useRadioStore } from '@/player/radio'
  import { useRoute } from 'vue-router'

  export default defineComponent({
    components: {
      ArtistList: ArtistList,
      GenreCloud: GenreCloud,
    },

    setup: function () {
      var api = inject('$api')
      var radio = useRadioStore()
      var route = useRoute()

      /** Genres with their first artists (empty in cloud mode). */
      var items = ref([])
      var loading = ref(true)
      var sort = ref(route.params.sort || null)

      var sortedItems = computed(function () {
        if (!items.value.length) {
          return []
        }

        if (sort.value === 'a-z') {
          return orderBy(items.value, 'name')
        }

        return orderBy(items.value, 'albumCount', 'desc')
      })

      // Route objects used by the sort links in the header.
      var sizeRoute = computed(function () {
        return Object.assign({}, route, { params: { sort: 'size' } })
      })

      var azRoute = computed(function () {
        return Object.assign({}, route, { params: { sort: 'a-z' } })
      })

      var cloudRoute = computed(function () {
        return Object.assign({}, route, { params: { sort: 'cloud' } })
      })

      /**
       * Build a genre entry together with its first artists.
       *
       * @param {Object} genre
       * @returns {Promise<Object>}
       */
      async function createGenreWithArtists(genre) {
        var artists = await api.getArtistsByGenre(genre.id, 16, 0)

        return {
          id: genre.id,
          name: genre.name,
          albumCount: genre.albumCount,
          artists: artists,
        }
      }

      /**
       * Load the remaining genres after the first batch has been rendered.
       * The caller does not wait for it, so the loader is not kept open.
       *
       * @param {Array} rest
       * @returns {Promise<void>}
       */
      async function appendRestGenres(rest) {
        var restPromises = []

        for (var i = 0; i < rest.length; i++) {
          restPromises.push(createGenreWithArtists(rest[i]))
        }

        var restItems = await Promise.all(restPromises)

        for (var j = 0; j < restItems.length; j++) {
          items.value.push(restItems[j])
        }
      }

      async function loadGenres() {
        loading.value = true
        items.value = []

        try {
          var genres = await api.getGenres()

          // CLOUD MODE = metadata only
          if (sort.value === 'cloud') {
            var cloudItems = []

            for (var i = 0; i < genres.length; i++) {
              cloudItems.push({
                id: genres[i].id,
                name: genres[i].name,
                albumCount: genres[i].albumCount,
                artists: [],
              })
            }

            items.value = cloudItems
            return
          }

          var firstBatch = genres.slice(0, 4)
          var firstPromises = []

          for (var j = 0; j < firstBatch.length; j++) {
            firstPromises.push(createGenreWithArtists(firstBatch[j]))
          }

          var firstItems = await Promise.all(firstPromises)
          items.value = firstItems

          var rest = genres.slice(4)
          appendRestGenres(rest)
        } catch (error) {
          console.error('Failed to load genres or artists:', error)
        } finally {
          loading.value = false
        }
      }

      watch(
        function () {
          return route.params.sort
        },
        async function (newSort) {
          sort.value = newSort || null
          await loadGenres()
        },
        { immediate: true }
      )

      return {
        items: items,
        sortedItems: sortedItems,
        loading: loading,
        sort: sort,
        sizeRoute: sizeRoute,
        azRoute: azRoute,
        cloudRoute: cloudRoute,
        loadGenres: loadGenres,
        radio: radio,
        api: api,
      }
    },
  })
</script>
