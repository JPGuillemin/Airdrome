<template>
  <div class="main-content">
    <h1 class=" poster-title">
      Playlists
    </h1>

    <div class="d-flex justify-content-between align-items-center mb-3">
      <ul class="nav-underlined">
        <li>
          <router-link :to="{ ...$route, params: { ...$route.params, sort: null } }">
            Recently added
          </router-link>
        </li>
        <li>
          <router-link :to="{ ...$route, params: { ...$route.params, sort: 'a-z' } }">
            A-Z
          </router-link>
        </li>
      </ul>
      <b-button variant="link" @click="showAddModal = true">
        <Icon icon="plus" />
      </b-button>
    </div>

    <PlaylistList v-if="items.length > 0" :items="items" :allow-h-scroll="false" />
    <EmptyIndicator v-else />

    <CreatePlaylistModal v-model="showAddModal" />
  </div>
</template>

<script lang="ts">
  import { computed, defineComponent, ref } from 'vue'
  import CreatePlaylistModal from '@/library/playlist/CreatePlaylistModal.vue'
  import PlaylistList from '@/library/playlist/PlaylistList.vue'
  import { orderBy } from 'lodash-es'
  import { usePlaylistStore } from '@/library/playlist/store'

  export default defineComponent({
    components: {
      CreatePlaylistModal,
      PlaylistList,
    },
    props: {
      sort: { type: String, default: null },
    },
    setup(props) {
      const store = usePlaylistStore()

      const showAddModal = ref(false)

      const items = computed(() =>
        props.sort === 'a-z'
          ? orderBy(store.playlists, 'name')
          : orderBy(store.playlists, 'createdAt', 'desc')
      )

      return {
        showAddModal,
        loading: computed(() => store.playlists === null),
        items,
      }
    },
  })
</script>

<style scoped>
  .poster-title {
    margin-top: 10px;
    font-size: 1.5rem;
  }
</style>
