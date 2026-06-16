// Tile.vue
<template>
  <div class="tile">
    <ContextMenu
      class="tile-img"
      :class="{ 'tile-img--circle': circle }"
      :enabled="!!$slots['context-menu']"
    >
      <router-link v-if="to" :to="to">
        <img v-if="image" :src="image" loading="lazy" alt="Album cover">
        <img v-else :src="fallback" alt="Fallback cover">
      </router-link>
      <template v-else>
        <img v-if="image" :src="image" loading="lazy" alt="Album cover">
        <img v-else :src="fallback" alt="Fallback cover">
      </template>

      <template #context-menu>
        <slot name="context-menu" />
      </template>
    </ContextMenu>

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

<script lang="ts">
  import { defineComponent } from 'vue'
  import fallback from '@/shared/assets/fallback.svg'

  export default defineComponent({
    props: {
      to: { type: Object, default: null },
      title: { type: String, default: '' },
      text: { type: String, default: '' },
      image: { type: String, default: '' },
      circle: { type: Boolean, default: false },
      titleOnly: { type: Boolean, default: false },
    },
    setup() {
      return { fallback }
    },
  })
</script>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    width: 100%;

    padding: 8px;
    border-radius: 12px;

    cursor: pointer;
    transition:
      background-color 0.2s ease,
      transform 0.2s ease;
  }

  .tile:hover {
    background-color: var(--theme-elevation-1);
  }

  .tile-img {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: 8px;
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
