<template>
  <!-- eslint-disable vue/no-v-html -->
  <svg
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    focusable="false"
    aria-hidden="true"
    width="1em"
    height="1em"
    fill="currentColor"
    preserveAspectRatio="xMidYMid meet"
    viewBox="0 0 16 16"
    class="bi icon"
    v-bind="$attrs"
    v-html="path"
  />
</template>
<script lang="ts">
  import { defineComponent } from 'vue'
  import iconAlbum from '@iconify-icons/bi/vinyl'
  import iconArrowUpDown from '@iconify-icons/bi/arrow-up-down'
  import iconArtist from '@iconify-icons/bi/incognito'
  import iconCheck from '@iconify-icons/bi/check'
  import iconChevronRight from '@iconify-icons/bi/chevron-compact-right'
  import iconDownload from '@iconify-icons/bi/download'
  import iconEdit from '@iconify-icons/bi/pencil-square'
  import iconFiles from '@iconify-icons/bi/files'
  import iconFolder from '@iconify-icons/bi/folder'
  import iconGear from '@iconify-icons/bi/gear-fill'
  import iconGenre from '@iconify-icons/bi/palette'
  import iconHeart from '@iconify-icons/bi/heart'
  import iconHeartFill from '@iconify-icons/bi/heart-fill'
  import iconHome from '@iconify-icons/bi/house-fill'
  import iconLibrary from '@iconify-icons/bi/collection'
  import iconLink from '@iconify-icons/bi/box-arrow-up-right'
  import iconList from '@iconify-icons/bi/list-ul'
  import iconMute from '@iconify-icons/bi/volume-mute-fill'
  import iconNav from '@iconify-icons/bi/list'
  import iconPause from '@iconify-icons/bi/pause-fill'
  import iconPerson from '@iconify-icons/bi/person-fill'
  import iconPlay from '@iconify-icons/bi/play-fill'
  import iconPlaylist from '@iconify-icons/bi/music-note-list'
  import iconPlus from '@iconify-icons/bi/plus'
  import iconPodcast from '@iconify-icons/bi/rss'
  import iconRadio from '@iconify-icons/bi/broadcast'
  import iconRefresh from '@iconify-icons/bi/arrow-counterclockwise'
  import iconRepeat from '@iconify-icons/bi/arrow-repeat'
  import iconShuffle from '@iconify-icons/bi/shuffle'
  import iconSkipEnd from '@iconify-icons/bi/skip-end-fill'
  import iconSkipStart from '@iconify-icons/bi/skip-start-fill'
  import iconSoundwave from '@iconify-icons/bi/soundwave'
  import iconStack from '@iconify-icons/bi/stack'
  import iconThreeDotsVertical from '@iconify-icons/bi/three-dots-vertical'
  import iconVolume from '@iconify-icons/bi/volume-up-fill'
  import iconX from '@iconify-icons/bi/x'

  const icons = {
    albums: iconAlbum.body,
    'arrow-up-down': iconArrowUpDown.body,
    artists: iconArtist.body,
    check: iconCheck.body,
    'chevron-right': iconChevronRight.body,
    discover: iconHome.body,
    download: iconDownload.body,
    edit: iconEdit.body,
    files: iconFiles.body,
    folder: iconFolder.body,
    gear: iconGear.body,
    genres: iconGenre.body,
    heart: iconHeart.body,
    'heart-fill': iconHeartFill.body,
    home: iconHome.body,
    library: iconLibrary.body,
    link: iconLink.body,
    list: iconList.body,
    mute: iconMute.body,
    nav: iconNav.body,
    pause: iconPause.body,
    person: iconPerson.body,
    play: iconPlay.body,
    playlist: iconPlaylist.body,
    plus: iconPlus.body,
    podcast: iconPodcast.body,
    radio: iconRadio.body,
    refresh: iconRefresh.body,
    repeat: iconRepeat.body,
    shuffle: iconShuffle.body,
    'skip-end': iconSkipEnd.body,
    'skip-start': iconSkipStart.body,
    soundwave: iconSoundwave.body,
    stack: iconStack.body,
    'three-dots-vertical': iconThreeDotsVertical.body,
    volume: iconVolume.body,
    x: iconX.body,
  } as {[key: string]: string}

  export default defineComponent({
    props: {
      icon: { type: String, required: true }
    },
    computed: {
      path(): string {
        if (this.icon in icons) {
          return icons[this.icon]
        }
        console.warn(`Unknown icon '${this.icon}'`)
        return ''
      }
    }
  })
</script>
<style>
  .btn .icon.bi,
  .dropdown-item .icon.bi,
  .dropdown-toggle .icon.bi,
  .input-group-text .icon.bi,
  .nav-link .icon.bi {
    font-size: 125%;
    vertical-align: text-bottom;
    pointer-events: none;
  }
</style>
