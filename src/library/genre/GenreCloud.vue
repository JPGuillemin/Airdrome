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

  type GenreItem = {
    id: string | number
    name: string
    albumCount?: number
  }

  type CloudWord = {
    text: string
    size: number
    id: string | number
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
        default: 'inherit',
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

        const MAX_WORDS = 50

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

        // Font sizes are intentionally modest — the bounding-box
        // scale applied after layout will stretch them to fill the space
        const MIN_SIZE = 8
        const MAX_SIZE = 34

        const words: CloudWord[] = sorted.map((item) => {
          const count = Math.max(item.albumCount || 1, 1)
          const normalized = max === min ? 1 : (count - min) / (max - min)
          return {
            text: item.name,
            id: item.id,
            size: MIN_SIZE + Math.pow(normalized, 1.2) * (MAX_SIZE - MIN_SIZE),
          }
        })

        const svg = d3.select(svgRef.value)
        svg.selectAll('*').interrupt()
        svg.selectAll('*').remove()

        cloud<CloudWord>()
          .size([width, height])
          .words(words)
          .padding(8)
          .rotate(() => 0)
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

          // ── Compute bounding box of placed words ──────────────────────────
          // d3-cloud sets x/y at word center and width/height as text bounds
          let x0 = Infinity, y0 = Infinity
          let x1 = -Infinity, y1 = -Infinity

          for (const w of layoutWords) {
            const hw = (w.width  || 0) / 2
            const hh = (w.height || 0) / 2
            x0 = Math.min(x0, (w.x || 0) - hw)
            y0 = Math.min(y0, (w.y || 0) - hh)
            x1 = Math.max(x1, (w.x || 0) + hw)
            y1 = Math.max(y1, (w.y || 0) + hh)
          }

          const cloudW = x1 - x0 || 1
          const cloudH = y1 - y0 || 1

          // Scale uniformly to fill container, with a small inset margin
          const margin = 12
          const scale = Math.min(
            (width  - margin * 2) / cloudW,
            (height - margin * 2) / cloudH
          )

          // ── Render ────────────────────────────────────────────────────────
          const svgEl = d3
            .select(svgRef.value)
            .attr('width', width)
            .attr('height', height)

          // Center the group, accounting for the bounding box offset and scale
          const tx = width  / 2 - ((x0 + x1) / 2) * scale
          const ty = height / 2 - ((y0 + y1) / 2) * scale

          const group = svgEl
            .append('g')
            .attr('transform', `translate(${tx}, ${ty}) scale(${scale})`)

          group
            .selectAll('text')
            .data(layoutWords)
            .enter()
            .append('text')
            .style('font-family', props.fontFamily)
            .style('font-size', (d) => `${d.size}px`)
            .style('fill', '#fff')
            .style('cursor', 'pointer')
            .style('user-select', 'none')
            .style('transition', 'fill 0.15s ease')
            .attr('text-anchor', 'middle')
            .attr('transform', (d) =>
              `translate(${d.x}, ${d.y}) rotate(${d.rotate})`
            )
            .text((d) => d.text)
            .on('mouseenter', function (this: SVGTextElement) {
              d3.select(this).style('fill', 'var(--bs-primary)')
            })
            .on('mouseleave', function (this: SVGTextElement) {
              d3.select(this).style('fill', '#fff')
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
