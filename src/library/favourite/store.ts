// store.ts
import { defineStore } from 'pinia'

type MediaType = 'track' | 'album' | 'artist'

export const useFavouriteStore = defineStore('favourite', {
  state: () => ({
    albums: {} as any,
    artists: {} as any,
    tracks: {} as any,
  }),
  actions: {
    load() {
      return this.api.getFavourites().then(result => {
        this.albums = createIdMap(result.albums)
        this.artists = createIdMap(result.artists)
        this.tracks = createIdMap(result.tracks)
      })
    },
    get(type: MediaType, id: string) {
      // console.info('favouriteStore.get(): ', id)
      const field = getTypeKey(type)
      return !!this[field][id]
    },
    async toggle(type: MediaType, id: string) {
      const field = getTypeKey(type)
      const previous = this[field]
      const wasFavourite = !!previous[id]

      // Optimistic update, rolled back if the server call fails.
      if (wasFavourite) {
        const updated = { ...previous }
        delete updated[id]
        this[field] = updated
      } else {
        this[field] = { ...previous, [id]: true }
      }

      try {
        if (wasFavourite) {
          await this.api.removeFavourite(id, type)
        } else {
          await this.api.addFavourite(id, type)
        }
      } catch (err) {
        this[field] = previous
        console.warn(`[favourite] failed to update ${type} ${id}`, err)
      }
    },
  },
})

function createIdMap(items: [{ id: string }]) {
  return Object.assign({}, ...items.map((item) => ({ [item.id]: true })))
}

function getTypeKey(type: string): 'albums' | 'artists' |'tracks' {
  switch (type) {
    case 'album': return 'albums'
    case 'artist': return 'artists'
    case 'track': return 'tracks'
    default: throw new Error(`unknown favourite type '${type}'`)
  }
}
