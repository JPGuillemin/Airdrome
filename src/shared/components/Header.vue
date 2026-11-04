// Header.vue
<template>
  <div class="header-container">
    <div
      class="header-backdrop"
      :style="{
        '--backgroundImage': backgroundImage,
        '--blurAmount': blur
      }"
    />
    <div class="header">
      <img
        :src="image || fallbackImage"
        :title="hover"
        class="cover-image cursor-pointer"
        @click="$emit('click')"
      >
      <div class="header-content">
        <slot />
      </div>
    </div>
  </div>
</template>

<script>
  import { defineComponent, computed } from 'vue'
  import fallbackImage from '@/shared/assets/fallback.svg'

  export default defineComponent({
    props: {
      /** Cover image URL; falls back to the default artwork when empty. */
      image: { type: String, default: null },
      /** CSS blur amount applied to the backdrop. */
      blur: { type: String, default: '5px' },
      /** Tooltip shown on the cover image. */
      hover: { type: String, default: null },
    },
    emits: ['click'],
    setup: function (props) {
      var backgroundImage = computed(function () {
        var image = props.image

        if (!image) {
          image = fallbackImage
        }

        return "url('" + image + "')"
      })

      return {
        fallbackImage: fallbackImage,
        backgroundImage: backgroundImage
      }
    }
  })
</script>

<style scoped>
  .header-container {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: stretch;   /* was: center — let .header fill full height */
    height: 170px;
  }

  .header {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;    /* now centers within the full 190px */
    padding-left: -0.5rem;
    width: 100%;
    height: 100%;           /* fill the stretched container */
    box-sizing: border-box;
  }

  .cover-image {
    width: 140px;
    height: 140px;
    object-fit: cover;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .header-backdrop {
    position: absolute;
    top: -15px;
    left: -15px;
    width: calc(100% + 20px);
    height: calc(100% + 20px);
    z-index: -1;
    opacity: 0.92;
    filter: blur(var(--blurAmount));
    background-image: linear-gradient(to bottom, transparent, black), var(--backgroundImage);
    background-size: cover;
    background-position: center;
  }

  .header-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-left: 1rem;
  }
</style>
