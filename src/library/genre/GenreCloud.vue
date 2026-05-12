<!-- GenreCloud.vue -->
<template>
  <div class="genre-word-cloud">
    <VueWordCloud
      :words="cloudWords"
      :font-family="fontFamily"
      :font-size-ratio="4"
      :spacing="1"
      :rotation="0"
      :animation-duration="0"
      style="width: 100%; height: 60vh;"
    >
      <template #default="{ text, weight, word }">
        <RouterLink
          v-memo="[word[2].id]"
          class="genre-word"
          :to="{ name: 'genre', params: { id: word[2].id } }"
          :style="`font-size:${weight}px`"
        >
          {{ text }}
        </RouterLink>
      </template>
    </VueWordCloud>
  </div>
</template>

<script lang="ts">
  import {
    defineComponent,
    shallowRef,
    watch,
    type PropType,
  } from 'vue'

  import VueWordCloud from 'vuewordcloud'

  type GenreItem = {
    id: string | number
    name: string
    albumCount?: number
  }

  export default defineComponent({
    name: 'GenreCloud',

    components: {
      [VueWordCloud.name]: VueWordCloud,
    },

    props: {
      items: {
        type: Array as PropType<GenreItem[]>,
        required: true,
      },

      fontFamily: {
        type: String,
        default: 'inherit',
      },
    },

    setup(props) {
      const cloudWords = shallowRef<any[]>([])

      watch(
        () => props.items,
        (items) => {
          if (!items?.length) {
            cloudWords.value = []
            return
          }

          const MAX_WORDS = 50

          const sorted = items.slice(0, MAX_WORDS)

          const counts = sorted.map((i) =>
            Math.max(i.albumCount || 1, 1)
          )

          const max = Math.max(...counts)
          const min = Math.min(...counts)

          cloudWords.value = sorted.map((item) => {
            const count = Math.max(
              item.albumCount || 1,
              1
            )

            const normalized =
              max === min
                ? 1
                : (count - min) / (max - min)

            const weight =
              14 + normalized * 20

            return [
              item.name,
              weight,
              {
                id: item.id,
              },
            ]
          })
        },
        {
          immediate: true,
        }
      )

      return {
        cloudWords,
      }
    },
  })
</script>

<style scoped>
  .genre-word-cloud {
    width: 100%;
    min-height: 60vh;
  }

  .genre-word {
    color: #fff;
    text-decoration: none;
    line-height: 1;
  }

  .genre-word:hover {
    opacity: 0.85;
  }
</style>
