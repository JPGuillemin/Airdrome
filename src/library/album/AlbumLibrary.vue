// AlbumLibrary.vue
<template>
  <div class="main-content">
    <div class="d-flex align-items-center justify-content-between my-3">
      <div class="d-inline-flex align-items-center">
        <Icon icon="albums" class="title-color me-2" />
        <span class="main-title">
          Albums
        </span>
      </div>
      <ul class="nav adapt-text">
        <li>
          <router-link :to="sortRoute('recently-added')">
            <Icon icon="new" />
          </router-link>
        </li>
        <li>
          <router-link :to="sortRoute('most-played')">
            <Icon icon="most" />
          </router-link>
        </li>
        <li>
          <router-link :to="sortRoute('recently-played')">
            <Icon icon="recent" />
          </router-link>
        </li>
        <li>
          <router-link :to="sortRoute('a-z')">
            A-z
          </router-link>
        </li>
        <li>
          <router-link :to="sortRoute('random')">
            <Icon icon="random" />
          </router-link>
        </li>
      </ul>
    </div>
    <AlbumList :items="albums" :allow-h-scroll="false" />
    <EmptyIndicator v-if="!loading && albums.length === 0" />
    <InfiniteLoader :loading="loading" :has-more="hasMore" @load-more="loadMore" />
  </div>
</template>

<script>
  import { defineComponent, ref, watch, inject } from 'vue'
  import { useRoute } from 'vue-router'
  import AlbumList from './AlbumList.vue'

  export default defineComponent({
    components: { AlbumList: AlbumList },
    props: {
      /** Album sort order requested by the route. */
      sort: { type: String, default: 'recently-added' }
    },
    setup: function (props) {
      var albums = ref([])
      var loading = ref(true)
      var offset = ref(0)
      var hasMore = ref(true)
      var api = inject('$api')
      var route = useRoute()

      watch(
        function () {
          return props.sort
        },
        function () {
          albums.value = []
          offset.value = 0
          hasMore.value = true
        }
      )

      /** Build the current route with a different album sort. */
      function sortRoute(sort) {
        var target = {}
        var keys = Object.keys(route)

        for (var i = 0; i < keys.length; i++) {
          target[keys[i]] = route[keys[i]]
        }

        target.params = { sort: sort }

        return target
      }

      async function loadMore() {
        loading.value = true

        var newAlbums = await api.getAlbums(props.sort, 30, offset.value)

        for (var i = 0; i < newAlbums.length; i++) {
          albums.value.push(newAlbums[i])
        }

        offset.value += newAlbums.length
        hasMore.value = newAlbums.length >= 30
        loading.value = false
      }

      return {
        albums: albums,
        loading: loading,
        offset: offset,
        hasMore: hasMore,
        sortRoute: sortRoute,
        loadMore: loadMore,
      }
    },
  })
</script>
