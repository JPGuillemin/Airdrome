<template>
  <td class="d-none d-lg-table-cell adapt-text">
    <span v-for="(artist, index) in track.artists" :key="artist.id">
      <span v-if="index > 0">, </span>
      <router-link
        v-if="artist.id"
        :to="{ name: 'artist', params: { id: artist.id } }"
        @click.stop
      >
        {{ artist.name }}
      </router-link>
      <span v-else>
        {{ artist.name }}
      </span>
    </span>
  </td>
</template>

<script lang="ts">
  import { defineComponent, PropType } from 'vue'
  import type { Track } from '@/shared/api'

  export default defineComponent({
    name: 'CellArtist',
    props: {
      track: { type: Object as PropType<Track>, required: true }
    }
  })
</script>
