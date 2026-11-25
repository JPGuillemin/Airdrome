<template>
  <b-button
    v-longpress-tooltip
    :title="title"
    variant="transparent"
    :class="[buttonClass, { 'theme-primary': mode !== ReplayGainMode.None }]"
    @click.stop="$emit('toggle')"
  >
    <IconReplayGain v-if="mode === ReplayGainMode.None" />
    <Icon
      v-else-if="mode === ReplayGainMode.Track"
      icon="music-note"
      color="var(--bs-primary)"
    />
    <Icon
      v-else
      icon="music-notes-beamed"
      color="var(--bs-primary)"
    />
  </b-button>
</template>

<script>
  import { defineComponent } from 'vue'
  import { ReplayGainMode } from '@/player/audioShared'
  import Icon from '@/shared/components/Icon.vue'
  import IconReplayGain from '@/shared/components/IconReplayGain.vue'

  export default defineComponent({
    name: 'ReplayGainButton',
    components: {
      Icon: Icon,
      IconReplayGain: IconReplayGain,
    },
    props: {
      mode: {
        type: Number,
        required: true,
      },
      title: {
        type: String,
        default: 'ReplayGain',
      },
      buttonClass: {
        type: String,
        default: 'm-0',
      },
    },
    emits: ['toggle'],
    setup: function () {
      return {
        ReplayGainMode: ReplayGainMode,
      }
    },
  })
</script>
