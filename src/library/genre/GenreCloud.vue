// GenreCloud.vue
<template>
  <div ref="container" class="genre-word-cloud">
    <svg ref="svgRef" class="word-cloud-svg" />
  </div>
</template>

<script>
  import {
    defineComponent,
    onMounted,
    onBeforeUnmount,
    ref,
    watch,
  } from 'vue'

  import { useRouter } from 'vue-router'
  import cloud from 'd3-cloud'
  import * as d3 from 'd3'
  import seedrandom from 'seedrandom'
  import { useRadioStore } from '@/player/radio'

  export default defineComponent({
    name: 'GenreCloud',

    props: {
      /**
       * Genre items to render. Each item has an id, a name and an
       * optional album count used to compute the font size.
       */
      items: {
        type: Array,
        required: true,
      },
      /** Font family used for the words. */
      fontFamily: {
        type: String,
        default: 'Inter',
      },
    },

    setup: function (props) {
      var router = useRouter()
      var radio = useRadioStore()
      var container = ref(null)
      var svgRef = ref(null)
      var resizeObserver = null

      // Long press handling
      var LONG_PRESS_MS = 500
      var MOVE_TOLERANCE = 10 // px: beyond this, it's a scroll/drag, not a press

      var pressTimer = null
      var longPressTriggered = false
      var startX = 0
      var startY = 0

      function cancelPress() {
        if (pressTimer) {
          clearTimeout(pressTimer)
          pressTimer = null
        }
      }

      function renderCloud() {
        if (!container.value || !svgRef.value) {
          return
        }

        var width = container.value.clientWidth
        var height = container.value.clientHeight

        if (width === 0 || height === 0) {
          return
        }

        var rng = seedrandom('genre-cloud')

        var MAX_WORDS = 100

        var sorted = props.items.slice()
          .sort(function (a, b) {
            return (b.albumCount || 0) - (a.albumCount || 0)
          })
          .slice(0, MAX_WORDS)

        if (!sorted.length) {
          d3.select(svgRef.value).selectAll('*').remove()
          return
        }

        var counts = []

        for (var i = 0; i < sorted.length; i++) {
          counts.push(Math.max(sorted[i].albumCount || 1, 1))
        }

        var max = Math.max.apply(null, counts)
        var min = Math.min.apply(null, counts)

        // Calculate font sizes based on actual container dimensions.
        // Use the smaller dimension to ensure words fit.
        var smallerDim = Math.min(width, height)
        var MIN_SIZE = Math.max(14, smallerDim * 0.025) // ~2.5% of smaller dimension
        var MAX_SIZE = Math.max(40, smallerDim * 0.15) // ~15% of smaller dimension

        // Create color scale - vibrant gradient from cyan to purple
        var colorScale = d3.scaleSequential()
          .domain([0, 1])
          .interpolator(d3.interpolateRgbBasis([
            '#c0c0c0',
            '#b0b0b0',
            '#a0a0a0',
            '#908080',
            '#808080',
          ]))

        var words = []

        for (var j = 0; j < sorted.length; j++) {
          var item = sorted[j]
          var count = Math.max(item.albumCount || 1, 1)
          var normalized = 0

          if (max === min) {
            normalized = 1
          } else {
            normalized = (count - min) / (max - min)
          }

          words.push({
            text: item.name,
            id: item.id,
            size: MIN_SIZE + Math.pow(normalized, 1.2) * (MAX_SIZE - MIN_SIZE),
            normalized: normalized,
          })
        }

        var svg = d3.select(svgRef.value)
        svg.selectAll('*').interrupt()
        svg.selectAll('*').remove()

        cloud()
          .size([width, height])
          .words(words)
          .padding(8)
          .rotate(function () {
            return 0
          })
          .random(rng)
          .font(props.fontFamily)
          .fontSize(function (d) {
            return d.size
          })
          .on('end', draw)
          .start()

        function draw(layoutWords) {
          if (!layoutWords.length) {
            return
          }

          if (layoutWords.length < words.length) {
            console.warn(
              'GenreCloud: ' + (words.length - layoutWords.length) + ' words dropped by layout'
            )
          }

          // Simple centered rendering - no scaling needed
          var svgEl = d3
            .select(svgRef.value)
            .attr('width', width)
            .attr('height', height)

          var group = svgEl
            .append('g')
            .attr('transform', 'translate(' + width / 2 + ', ' + height / 2 + ')')

          group
            .selectAll('text')
            .data(layoutWords)
            .enter()
            .append('text')
            .style('font-family', props.fontFamily)
            .style('font-size', function (d) {
              return d.size + 'px'
            })
            .style('fill', function (d) {
              return colorScale(d.normalized || 0)
            })
            .style('cursor', 'pointer')
            .style('user-select', 'none')
            .style('-webkit-user-select', 'none')
            .style('-webkit-touch-callout', 'none')
            .style('transition', 'fill 0.15s ease')
            .attr('text-anchor', 'middle')
            .attr('transform', function (d) {
              return 'translate(' + d.x + ', ' + d.y + ') rotate(' + d.rotate + ')'
            })
            .text(function (d) {
              return d.text
            })
            .on('mouseenter', function (_, d) {
              d3.select(this).style('fill', 'var(--bs-primary)')
            })
            .on('mouseleave', function (_, d) {
              d3.select(this).style('fill', colorScale(d.normalized || 0))
            })
            .on('pointerdown', function (event, d) {
              longPressTriggered = false
              startX = event.clientX
              startY = event.clientY
              cancelPress()
              pressTimer = setTimeout(async function () {
                pressTimer = null
                longPressTriggered = true

                if (navigator.vibrate) {
                  navigator.vibrate(30)
                }

                await radio.shuffleGenre(String(d.id))
              }, LONG_PRESS_MS)
            })
            .on('pointermove', function (event) {
              if (!pressTimer) {
                return
              }

              if (
                Math.abs(event.clientX - startX) > MOVE_TOLERANCE ||
                Math.abs(event.clientY - startY) > MOVE_TOLERANCE
              ) {
                cancelPress()
              }
            })
            .on('pointerup', cancelPress)
            .on('pointerleave', cancelPress)
            .on('pointercancel', cancelPress)
            .on('contextmenu', function (event) {
              // Prevent the native context menu after a long press (mobile / right-click)
              event.preventDefault()
            })
            .on('click', function (event, d) {
              // The release after a long press fires a click: ignore it
              if (longPressTriggered) {
                longPressTriggered = false
                return
              }

              router.push({ name: 'genre', params: { id: d.id } })
            })
        }
      }

      onMounted(function () {
        renderCloud()
        resizeObserver = new ResizeObserver(function () {
          renderCloud()
        })

        if (container.value) {
          resizeObserver.observe(container.value)
        }
      })

      onBeforeUnmount(function () {
        cancelPress()

        if (resizeObserver) {
          resizeObserver.disconnect()
        }
      })

      watch(
        function () {
          return props.items
        },
        function () {
          renderCloud()
        },
        { deep: true }
      )

      return {
        container: container,
        svgRef: svgRef,
      }
    },
  })
</script>

<style scoped>
  .genre-word-cloud {
    width: 100%;
    height: clamp(320px, 65vh, 900px);
    transform: translateY(-20px);
  }

  .word-cloud-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  /* Mobile */
  @media(max-width:768px) {
    .genre-word-cloud {
      width: 100%;
      height: clamp(320px, 65vh, 900px);
      transform: translateY(0px);
    }
  }
</style>
