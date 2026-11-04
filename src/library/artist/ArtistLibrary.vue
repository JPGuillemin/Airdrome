// ArtistLibrary.vue
<template>
  <div class="main-content">
    <div class="d-flex align-items-center justify-content-between my-3">
      <div class="d-inline-flex align-items-center">
        <Icon icon="artists" class="title-color me-2" />
        <span class="main-title">
          Artists
        </span>
      </div>
      <ul class="nav adapt-text">
        <li>
          <router-link :to="defaultRoute">
            <Icon icon="most" />
          </router-link>
        </li>
        <li>
          <router-link :to="azRoute">
            A-z
          </router-link>
        </li>
      </ul>
    </div>
    <ArtistList :items="visibleArtists" :allow-h-scroll="false" />
    <EmptyIndicator v-if="!loading && visibleArtists.length === 0" />
    <InfiniteLoader :loading="loading" :has-more="hasMore" @load-more="loadMore" />
  </div>
</template>

<script>
  import { defineComponent, ref, computed, watch, inject } from 'vue'
  import { orderBy } from 'lodash-es'
  import { useRoute } from 'vue-router'
  import ArtistList from './ArtistList.vue'

  export default defineComponent({
    components: { ArtistList: ArtistList },

    props: {
      /** Current sort mode ('default' or 'a-z'). */
      sort: { type: String, default: null },
    },

    setup: function (props) {
      var api = inject('$api')
      var route = useRoute()

      var loading = ref(true)

      /** Every artist returned by the API. */
      var allArtists = ref([])

      /** Artists currently rendered (grows as the user scrolls). */
      var visibleArtists = ref([])

      var chunkSize = ref(15)
      var nextIndex = ref(0)
      var hasMore = ref(true)

      var sortedAll = computed(function () {
        if (props.sort === 'a-z') {
          return orderBy(allArtists.value, 'name')
        }

        return orderBy(allArtists.value, 'albumCount', 'desc')
      })

      // Route objects used by the sort links in the header.
      var defaultRoute = computed(function () {
        return Object.assign({}, route, {
          params: Object.assign({}, route.params, { sort: 'default' }),
        })
      })

      var azRoute = computed(function () {
        return Object.assign({}, route, {
          params: Object.assign({}, route.params, { sort: 'a-z' }),
        })
      })

      function reset() {
        loading.value = true
        allArtists.value = []
        visibleArtists.value = []
        nextIndex.value = 0
        hasMore.value = true
      }

      function appendNextChunk() {
        var sorted = sortedAll.value
        var nextChunk = sorted.slice(nextIndex.value, nextIndex.value + chunkSize.value)

        for (var i = 0; i < nextChunk.length; i++) {
          visibleArtists.value.push(nextChunk[i])
        }

        nextIndex.value += nextChunk.length
        hasMore.value = nextIndex.value < sorted.length
      }

      async function fetchArtists() {
        try {
          var result = await api.getArtists()
          allArtists.value = result
          appendNextChunk()
        } finally {
          loading.value = false
        }
      }

      function loadMore() {
        appendNextChunk()
      }

      watch(
        function () {
          return props.sort
        },
        async function () {
          reset()
          await fetchArtists()
        },
        { immediate: true }
      )

      return {
        loading: loading,
        allArtists: allArtists,
        visibleArtists: visibleArtists,
        chunkSize: chunkSize,
        nextIndex: nextIndex,
        hasMore: hasMore,
        sortedAll: sortedAll,
        defaultRoute: defaultRoute,
        azRoute: azRoute,
        reset: reset,
        appendNextChunk: appendNextChunk,
        fetchArtists: fetchArtists,
        loadMore: loadMore,
      }
    },
  })
</script>
