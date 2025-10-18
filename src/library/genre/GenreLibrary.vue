<template>
  <div class="main-content">
    <h1>Genres</h1>
    <ul class="nav-underlined mb-3">
      <li>
        <router-link :to="{ ...$route, params: { sort: null } }">
          Most albums
        </router-link>
      </li>
      <li>
        <router-link :to="{ ...$route, params: { sort: 'a-z' } }">
          A-Z
        </router-link>
      </li>
    </ul>

    <div v-if="sortedItems.length > 0" class="d-flex flex-wrap justify-content-center gap-2 px-2 py-2 px-md-0">
      <span v-for="item in sortedItems" :key="item.id" class="text-bg-secondary rounded-pill py-3 px-2 text-truncate text-center" style="width: 160px;">
        <router-link :to="{ name: 'genre', params: { id: item.id } }" class="text-decoration-none" style="color: var(--bs-primary) !important;">
          {{ item.name }}
        </router-link>
      </span>
    </div>
    <EmptyIndicator v-else />
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'
  import { orderBy } from 'lodash-es'
  import { useLoader } from '@/shared/loader'

  export default defineComponent({
    props: { sort: { type: String, default: null } },
    data() {
      return { items: [] as any[], loading: true }
    },
    computed: {
      sortedItems(): any[] {
        return this.sort === 'a-z'
          ? orderBy(this.items, 'name')
          : orderBy(this.items, 'albumCount', 'desc')
      }
    },
    watch: {
      '$route.params.sort': {
        immediate: true,
        handler() {
          this.loadGenres()
        }
      }
    },
    methods: {
      async loadGenres() {
        this.loading = true
        const loader = useLoader()
        loader.showLoading()
        try {
          this.items = await this.$api.getGenres()
        } finally {
          loader.hideLoading()
          this.loading = false
        }
      }
    }
  })
</script>
