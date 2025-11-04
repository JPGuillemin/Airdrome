<template>
  <div class="tile card">
    <ContextMenu class="tile-img" :class="{ 'tile-img--circle': circle }" :enabled="!!$slots['context-menu']">
      <router-link v-if="to" :to="to">
        <img v-if="image" :src="image" alt="Album cover">
        <img v-else :src="fallback" alt="Fallback cover">
      </router-link>
      <template v-else>
        <img v-if="image" :src="image" alt="Album cover">
        <img v-else :src="fallback" alt="Fallback cover">
      </template>

      <template #context-menu>
        <slot name="context-menu" />
      </template>
    </ContextMenu>

    <div class="card-body">
      <div class="text-truncate fw-bold">
        <slot name="title">
          {{ title }}
        </slot>
      </div>
      <div class="text-truncate text-muted">
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
    },
    setup() {
      return { fallback }
    },
  })
</script>
<style>
  .tile-img {
    position: relative;
    width: 100%;
  }

  /* make image circular without clipping children */
  .tile-img--circle {
    border-radius: 50%;
    overflow: visible; /* allow dropdowns to escape */
  }

  /* clip only the image itself, not its children */
  .tile-img--circle img {
    clip-path: circle(50%);
  }

  .tile-img img {
    position: absolute;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
