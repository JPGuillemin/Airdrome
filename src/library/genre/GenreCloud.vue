// GenreCloud.vue
<template>
  <div ref="container" class="genre-word-cloud">
    <svg ref="svgRef" class="word-cloud-svg" />
  </div>
</template>

<script lang="ts">
  import {
    defineComponent,
    onMounted,
    onBeforeUnmount,
    ref,
    watch,
    type PropType,
  } from 'vue'

  import { useRouter } from 'vue-router'
  import cloud from 'd3-cloud'
  import * as d3 from 'd3'
  import seedrandom from 'seedrandom'

  type GenreItem = {
    id: string | number
    name: string
    albumCount?: number
  }

  type CloudWord = {
    text: string
    size: number
    id: string | number
    normalized?: number  // for color calculation
    x?: number
    y?: number
    rotate?: number
    width?: number   // set by d3-cloud after layout
    height?: number  // set by d3-cloud after layout
  }

  export default defineComponent({
    name: 'GenreCloud',

    props: {
      items: {
        type: Array as PropType<GenreItem[]>,
        required: true,
      },
      fontFamily: {
        type: String,
        default: 'Roboto',
      },
    },

    setup(props) {
      const router = useRouter()
      const container = ref<HTMLDivElement | null>(null)
      const svgRef = ref<SVGSVGElement | null>(null)
      let resizeObserver: ResizeObserver | null = null

      const renderCloud = () => {
        if (!container.value || !svgRef.value) return

        const width = container.value.clientWidth
        const height = container.value.clientHeight
        if (width === 0 || height === 0) return

        const rng = seedrandom('genre-cloud')

        const MAX_WORDS = 100

        const sorted = [...props.items]
          .sort((a, b) => (b.albumCount || 0) - (a.albumCount || 0))
          .slice(0, MAX_WORDS)

        if (!sorted.length) {
          d3.select(svgRef.value).selectAll('*').remove()
          return
        }

        const counts = sorted.map((i) => Math.max(i.albumCount || 1, 1))
        const max = Math.max(...counts)
        const min = Math.min(...counts)

        // Calculate font sizes based on actual container dimensions
        // Use the smaller dimension to ensure words fit
        const smallerDim = Math.min(width, height)
        const MIN_SIZE = Math.max(10, smallerDim * 0.025)  // ~2.5% of smaller dimension
        const MAX_SIZE = Math.max(40, smallerDim * 0.15)   // ~15% of smaller dimension

        // Create color scale - vibrant gradient from cyan to purple
        const colorScale = d3.scaleSequential()
          .domain([0, 1])
          .interpolator(d3.interpolateRgbBasis([
            '#303030', // deep grey
            '#4d4d4d', // dark grey
            '#808080', // medium grey
            '#d9d9d9', // light grey
            '#e0e0e0', // very light grey
          ]))

        const words: CloudWord[] = sorted.map((item) => {
          const count = Math.max(item.albumCount || 1, 1)
          const normalized = max === min ? 1 : (count - min) / (max - min)
          return {
            text: item.name,
            id: item.id,
            size: MIN_SIZE + Math.pow(normalized, 1.2) * (MAX_SIZE - MIN_SIZE),
            normalized,
          }
        })

        const svg = d3.select(svgRef.value)
        svg.selectAll('*').interrupt()
        svg.selectAll('*').remove()

        cloud<CloudWord>()
          .size([width, height])
          .words(words)
          .padding(10)  // Reduced padding since we're not scaling
          .rotate(() => 0)
          .random(rng)
          .font(props.fontFamily)
          .fontSize((d) => d.size)
          .on('end', draw)
          .start()

        function draw(layoutWords: CloudWord[]) {
          if (!layoutWords.length) return

          if (layoutWords.length < words.length) {
            console.warn(
              `GenreCloud: ${words.length - layoutWords.length} words dropped by layout`
            )
          }

          // Simple centered rendering - no scaling needed
          const svgEl = d3
            .select(svgRef.value)
            .attr('width', width)
            .attr('height', height)

          const group = svgEl
            .append('g')
            .attr('transform', `translate(${width / 2}, ${height / 2})`)

          group
            .selectAll('text')
            .data(layoutWords)
            .enter()
            .append('text')
            .style('font-family', props.fontFamily)
            .style('font-size', (d) => `${d.size}px`)
            .style('fill', (d) => colorScale(d.normalized || 0))
            .style('cursor', 'pointer')
            .style('user-select', 'none')
            .style('transition', 'fill 0.15s ease')
            .attr('text-anchor', 'middle')
            .attr('transform', (d) =>
              `translate(${d.x}, ${d.y}) rotate(${d.rotate})`
            )
            .text((d) => d.text)
            .on('mouseenter', function (this: SVGTextElement, _, d) {
              d3.select(this).style('fill', '#fff')
            })
            .on('mouseleave', function (this: SVGTextElement, _, d) {
              d3.select(this).style('fill', colorScale(d.normalized || 0))
            })
            .on('click', (_, d) => {
              router.push({ name: 'genre', params: { id: d.id } })
            })
        }
      }

      onMounted(() => {
        renderCloud()
        resizeObserver = new ResizeObserver(() => renderCloud())
        if (container.value) resizeObserver.observe(container.value)
      })

      onBeforeUnmount(() => {
        resizeObserver?.disconnect()
      })

      watch(
        () => props.items,
        () => renderCloud(),
        { deep: true }
      )

      return { container, svgRef }
    },
  })
</script>

<style scoped>
  .genre-word-cloud {
    width: 100%;
    height: clamp(320px, 65vh, 900px);
  }

  .word-cloud-svg {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
