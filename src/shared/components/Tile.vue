<template functional>
  <div class="tile card" v-bind="data.attrs" v-on="data.on">
    <ContextMenu class="tile-img" :enabled="!!$slots['context-menu']">
      <router-link :to="props.to">
        <img v-if="props.image" :src="props.image" :class="['tile-image', { 'circle': props.circle }]">
        <img v-else src="@/shared/assets/fallback.svg">
      </router-link>
      <template #context-menu>
        <slot name="context-menu" />
      </template>
    </ContextMenu>
    <div class="card-body">
      <div class="small-font text-truncate fw-bold">
        <slot name="title">
          <router-link :to="props.to">
            {{ props.title }}
          </router-link>
        </slot>
      </div>
      <div class="small-font text-truncate text-muted">
        <slot name="text">
          {{ props.text }}
        </slot>
      </div>
    </div>
  </div>
</template>

<style>
  .tile-img {
    position: relative;
    width: 100%;

    & img {
      position: absolute;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
  .small-font {
    font-size: 0.65em;
  }
  .tile-image.circle {
    border-radius: 50%;
  }
</style>
