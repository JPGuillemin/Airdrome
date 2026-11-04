// index.js
import Avatar from './Avatar.vue'
import TrackMenu from '@/shared/components/TrackMenu.vue'
import TrackMenuItem from '@/shared/components/TrackMenuItem.vue'
import EmptyIndicator from './EmptyIndicator.vue'
import ExternalLink from './ExternalLink.vue'
import Header from './Header.vue'
import Icon from './Icon.vue'
import InfiniteLoader from './InfiniteLoader.vue'
import OverflowMenu from './OverflowMenu.vue'
import Tiles from './Tiles.vue'
import Tile from './Tile.vue'
import TileActionButton from './TileActionButton.vue'
import {
  BButton,
  BModal
} from 'bootstrap-vue-next'

/** Globally registered components, keyed by their tag name. */
export var components = {
  Avatar: Avatar,
  BButton: BButton,
  BModal: BModal,
  TrackMenu: TrackMenu,
  TrackMenuItem: TrackMenuItem,
  EmptyIndicator: EmptyIndicator,
  ExternalLink: ExternalLink,
  Header: Header,
  Icon: Icon,
  InfiniteLoader: InfiniteLoader,
  OverflowMenu: OverflowMenu,
  Tile: Tile,
  Tiles: Tiles,
  TileActionButton: TileActionButton
}
