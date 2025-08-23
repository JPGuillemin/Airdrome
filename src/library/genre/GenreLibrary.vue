<template>
  <div class="main-content">
    <ul class="nav-underlined mb-3">
      <li>
        <router-link :to="{... $route, params: {... $route.params, sort: null }}">
          Most albums
        </router-link>
      </li>
      <li>
        <router-link :to="{... $route, params: {... $route.params, sort: 'a-z' }}">
          A-Z
        </router-link>
      </li>
    </ul>

    <ContentLoader v-slot :loading="loading">
      <div v-if="sortedItems.length > 0" class="mb-4">
        <h3>Genres</h3>
        <div
          class="d-flex gap-2 px-2 py-2 px-md-0 flex-nowrap flex-md-wrap overflow-auto overflow-md-visible"
          style="scrollbar-width: none; -ms-overflow-style: none;">
          <span
            v-for="item in sortedItems"
            :key="item.id"
            class="text-bg-secondary rounded-pill py-3 px-2 flex-shrink-0 text-truncate text-center align-items-center justify-content-center"
            style="width: 200px;">
            <router-link
              :to="{name: 'genre', params: { id: item.id } }"
              class="text-decoration-none"
              style="color: var(--bs-primary) !important;">
              {{ item.name }}
            </router-link>
          </span>
        </div>
      </div>
      <EmptyIndicator v-else />
    </ContentLoader>
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import { orderBy } from 'lodash-es'

  export default defineComponent({
    props: {
      sort: { type: String, default: null },
    },
    data() {
      return {
        loading: true,
        items: [],
      }
    },
    computed: {
      sortedItems(): any[] {
        return this.sort === 'a-z'
          ? orderBy(this.items, 'name')
          : orderBy(this.items, 'albumCount', 'desc')
      },
    },
    async created() {
      this.items = await this.$api.getGenres()
      this.loading = false
    },
  })
</script>
