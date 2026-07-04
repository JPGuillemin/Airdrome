// TrackTiles.vue
<template>
  <Tiles :tile-size="tileSize" :allow-h-scroll="allowHScroll" :twin-rows="twinRows">
    <Tile
      v-for="(item, index) in validItems"
      :key="item.id || index"
      :title="item.title || 'Unknown Track'"
      :image="item.image || ''"
      draggable="true"
      :title-only="titleOnly"
      @dragstart="dragstart(item, $event)"
      @click="playNow(index)"
    >
      <!-- Artists and Album -->
      <template #text>
        <!-- Artists -->
        <template v-if="withArtist">
          <span v-for="(artist, aIndex) in item.artists" :key="artist.id">
            <span v-if="aIndex > 0" class="text-muted">, </span>
            <router-link
              :to="{ name: 'artist', params: { id: artist.id } }"
              class="text-muted"
            >
              {{ artist.name }}
            </router-link>
          </span>
        </template>
        <!-- Album -->
        <span v-if="withAlbum && item.album" class="text-muted">
          <span v-if="withArtist && item.artists?.length"> • </span>
          {{ item.album }}
        </span>
      </template>
      <!-- Hover Actions -->
      <template v-if="tileSize > 79" #actions>
        <TileActionButton icon="queue-next" label="Play next" @click.stop="playNext(item)" />
        <TileActionButton icon="queue" label="Add to queue" @click.stop="addToQueue(item)" />
        <TileActionButton
          :icon="isFavourite(item.id) ? 'heart-fill' : 'heart'"
          label="Like"
          @click.stop="toggleFavourite(item.id)"
        />
      </template>
    </Tile>
  </Tiles>
</template>

<script lang="ts">
  import { defineComponent, computed } from 'vue'
  import { useFavouriteStore } from '@/library/favourite/store'
  import { usePlayerStore } from '@/player/store'
  import { useCacheStore } from '@/shared/cache'
  import type { Track } from '@/shared/api'
  import { sleep } from '@/shared/utils'

  export default defineComponent({
    props: {
      items: {
        type: Array as () => Track[],
        required: true,
      },
      allowHScroll: { type: Boolean, default: false },
      tileSize: { type: Number, default: 105 },
      twinRows: { type: Boolean, default: false },
      titleOnly: { type: Boolean, default: false },
      withArtist: { type: Boolean, default: true },
      withAlbum: { type: Boolean, default: false },
    },
    emits: ['favourite-added'],
    setup(props, { emit }) {
      const favouriteStore = useFavouriteStore()
      const playerStore = usePlayerStore()
      const cacheStore = useCacheStore()

      const validItems = computed(() =>
        (props.items || []).filter((item): item is Track => !!item?.id)
      )

      // Append only the clicked track to the end of the existing queue,
      // then jump to it. Keeps the queue state intact and the playing track
      // correctly highlighted in the queue view.
      const playNow = (index: number) => {
        const track = validItems.value[index]
        if (track?.url) cacheStore.cacheTrack(track.url)
        playerStore.setShuffle(false)
        const insertIndex = playerStore.queue.length
        playerStore.addToQueue([track])
        return playerStore.playTrackListIndex(insertIndex)
      }

      const toggleFavourite = async (id: string) => {
        const track = validItems.value.find(t => t.id === id)
        if (!track) return

        await favouriteStore.toggle('track', id)
        await sleep(300)

        if (isFavourite(id)) {
          // cache.ts stores/retrieves by stream URL, not by track id
          if (track.url) await cacheStore.cacheTrack(track.url)
          emit('favourite-added', track)
        } else {
          if (track.url) await cacheStore.deleteTrack(track.url)
        }
      }

      const playNext = (track: Track) => {
        playerStore.setNextInQueue([track])
      }

      const addToQueue = (track: Track) => {
        playerStore.addToQueue([track])
      }

      const dragstart = (item: Track, event: DragEvent) => {
        if (!item.isStream) {
          event.dataTransfer?.setData('application/x-track-id', item.id)
        }
      }

      const isFavourite = (id: string) =>
        favouriteStore.get('track', id)

      return {
        validItems,
        playNow,
        playNext,
        addToQueue,
        toggleFavourite,
        dragstart,
        isFavourite,
      }
    },
  })
</script>
