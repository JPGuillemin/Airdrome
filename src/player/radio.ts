import { defineStore } from 'pinia'
import { nextTick } from 'vue'
import router from '@/main'
import { useLoader } from '@/shared/loader'
import { usePlayerStore } from '@/player/store'

export const useRadioStore = defineStore('radio', () => {
  const playerStore = usePlayerStore()
  const loader = useLoader()

  const playRandom = async(api: any, query: Record<string, any>) => {
    loader.showLoading()
    let shouldRoute = false

    try {
      const tracks = await api.getRandomTracks(query)

      if (!tracks.length) return

      await playerStore.playNow(tracks)
      shouldRoute = true
    } finally {
      loader.hideLoading()
      if (shouldRoute) {
        nextTick(() => {
          router.push({ name: 'queue' })
        })
      }
    }
  }

  const shuffleGenre = async(api: any, genreId: string) => {
    return playRandom(api, {
      genre: genreId,
      size: 200,
    })
  }

  const shuffleRecentlyPlayed = async(api: any) => {
    return playRandom(api, {
      source: 'recently-played',
      size: 200,
    })
  }

  const shuffleRecentlyAdded = async(api: any) => {
    return playRandom(api, {
      source: 'recently-added',
      size: 200,
    })
  }

  const shuffleMostPlayed = async(api: any) => {
    return playRandom(api, {
      source: 'most-played',
      size: 200,
    })
  }

  const shuffleMood = async(api: any, genreName: string) => {
    return playRandom(api, {
      genre: genreName,
      size: 200,
    })
  }

  const shuffleFavouriteAlbums = async(api: any) => {
    return playRandom(api, {
      favourites: 'albums',
      size: 200,
    })
  }

  const shuffleFavouriteArtists = async(api: any) => {
    return playRandom(api, {
      favourites: 'artists',
      size: 200,
    })
  }

  const shufflePlaylists = async(api: any) => {
    return playRandom(api, {
      source: 'playlists',
      size: 200,
    })
  }

  return {
    shuffleGenre,
    shuffleRecentlyPlayed,
    shuffleRecentlyAdded,
    shuffleMostPlayed,
    shuffleMood,
    shuffleFavouriteAlbums,
    shuffleFavouriteArtists,
    shufflePlaylists,
  }
})
