// Tile.vue
<template>
  <div class="tile">
    <div
      class="tile-img"
      :class="{ 'tile-img--circle': circle }"
    >
      <router-link v-if="to" :to="to">
        <img v-if="image" :src="image" loading="lazy" alt="Album cover">
        <img v-else :src="fallback" alt="Fallback cover">
      </router-link>
      <template v-else>
        <img v-if="image" :src="image" loading="lazy" alt="Album cover">
        <img v-else :src="fallback" alt="Fallback cover">
      </template>

      <div v-if="$slots.actions" class="tile-actions">
        <slot name="actions" />
      </div>
    </div>

    <div class="tile-text">
      <div class="text-truncate">
        <slot name="title">
          <router-link v-if="to" :to="to" class="tile-title">
            {{ title }}
          </router-link>
          <span v-else>
            {{ title }}
          </span>
        </slot>
      </div>
      <div v-if="!titleOnly" class="text-truncate text-muted">
        <slot name="text">
          {{ text }}
        </slot>
      </div>
    </div>
  </div>
</template>

<script>
  import { defineComponent } from 'vue'
  import fallback from '@/shared/assets/fallback.svg'

  export default defineComponent({
    props: {
      /** Optional router-link target. */
      to: { type: Object, default: null },
      /** Tile title. */
      title: { type: String, default: '' },
      /** Tile subtitle. */
      text: { type: String, default: '' },
      /** Cover image URL. */
      image: { type: String, default: '' },
      /** Render the cover as a circle. */
      circle: { type: Boolean, default: false },
      /** Hide the subtitle row. */
      titleOnly: { type: Boolean, default: false },
    },
    setup: function () {
      return { fallback: fallback }
    },
  })
</script>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    width: 100%;

    box-sizing: border-box;
    padding: 8px;
    border: 1px solid transparent;
    border-radius: var(--theme-radius-md);

    cursor: pointer;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      transform 0.2s ease;
  }

  .tile:hover {
    background-color: var(--theme-elevation-1);
    border-color: var(--theme-border);
  }

  .tile-img {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: var(--theme-radius-sm);
  }

  /* make image circular without clipping children */
  .tile-img--circle {
    border-radius: 50%;
    overflow: visible;
  }

  /* clip only the image itself */
  .tile-img--circle img {
    clip-path: circle(50%);
  }

  .tile-img img {
    position: absolute;
    inset: 0;

    width: 100%;
    height: 100%;

    object-fit: cover;
    border-radius: inherit;
  }

  /* Row of icon actions overlaid at the bottom of the tile image,
     revealed on hover/focus instead of the old dropdown menu. */
  .tile-actions {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;

    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 4px;

    background: linear-gradient(to top, rgba(0, 0, 0, 0.65), transparent);
    border-radius: 0 0 var(--theme-radius-sm) var(--theme-radius-sm);

    opacity: 0;
    transform: translateY(4px);
    pointer-events: none;
    transition:
      opacity 0.15s ease,
      transform 0.15s ease;
  }

  .tile:hover .tile-actions,
  .tile:focus-within .tile-actions {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  /* Metadata font for tile captions (title + subtitle) */
  .tile-text {
    margin-top: 8px;
    font-family: var(--font-metadata);
  }

  .tile:hover .tile-title {
    color: var(--bs-primary);
  }

  /* ----------------------------- */
  /* 3-ROWS MODE */
  /* ----------------------------- */

  .tiles-three-rows .tile {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  .tiles-three-rows .tile-img {
    width: var(--tile-size-active);
    padding-bottom: var(--tile-size-active);
    flex-shrink: 0;
  }

  .tiles-three-rows .tile-text {
    width: 100px;
    min-width: 100px;
    overflow: hidden;

    display: flex;
    flex-direction: column;
    justify-content: center;

    margin-top: 0;
  }
</style>
