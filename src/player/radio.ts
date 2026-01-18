import { defineStore } from 'pinia'
import { nextTick } from 'vue'
import router from '@/main'
import { useLoader } from '@/shared/loader'
import { usePlayerStore } from '@/player/store'
import type { Track, API } from '@/shared/api'

export const useRadioStore = defineStore('radio', () => {
  const playerStore = usePlayerStore()
  const loader = useLoader()

  // -------- HELPERS --------
  function takeUpTo200(acc: Track[], next: Track[]): Track[] {
    if (acc.length >= 200) return acc
    const remaining = 200 - acc.length
    return acc.concat(next.slice(0, remaining))
  }

  function shuffleTracks<T extends Track[]>(tracks: T): T {
    const copy = [...tracks] as T
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }

  function pickRandom<T>(arr: T[], count: number): T[] {
    const copy = [...arr]
    const result: T[] = []

    while (result.length < count && copy.length) {
      const i = Math.floor(Math.random() * copy.length)
      result.push(copy.splice(i, 1)[0])
    }
    return result
  }

  // -------- CORE --------
  const playRandomOrTracks = async(opts:
    | { api: API; params: Parameters<API['getRandomTracks']>[0] }
    | { tracks: Track[] }
  ) => {
    loader.showLoading()
    let shouldRoute = false

    try {
      let tracks: Track[] = []

      if ('params' in opts) {
        tracks = await opts.api.getRandomTracks(opts.params)
      } else {
        tracks = opts.tracks
      }

      if (!tracks?.length) return

      const randomized = shuffleTracks(tracks)

      await playerStore.playNow(randomized)
      shouldRoute = true
    } finally {
      loader.hideLoading()
      if (shouldRoute) {
        nextTick(() => router.push({ name: 'queue' }))
      }
    }
  }

  // -------- RADIOS --------
  const shuffleGenre = (api: API, genreId: string) =>
    playRandomOrTracks({ api, params: { genre: genreId, size: 200 } })

  const shuffleMood = (api: API, genreName: string) =>
    playRandomOrTracks({ api, params: { genre: genreName, size: 200 } })

  const luckyRadio = (api: API) =>
    playRandomOrTracks({ api, params: { size: 200 } })

  const shuffleRecentlyPlayed = async(api: API) => {
    loader.showLoading()
    try {
      const albums = pickRandom(await api.getAlbums('recently-played', 50), 10)
      let tracks: Track[] = []

      for (const album of albums) {
        const fullAlbum = await api.getAlbumDetails(album.id)
        if (fullAlbum.tracks?.length) {
          tracks = takeUpTo200(tracks, fullAlbum.tracks)
          if (tracks.length >= 200) break
        }
      }

      if (tracks.length) {
        await playRandomOrTracks({ tracks })
      }
    } finally {
      loader.hideLoading()
    }
  }

  const shuffleRecentlyAdded = async(api: API) => {
    loader.showLoading()
    try {
      const albums = pickRandom(await api.getAlbums('recently-added', 50), 10)
      let tracks: Track[] = []

      for (const album of albums) {
        const fullAlbum = await api.getAlbumDetails(album.id)
        if (fullAlbum.tracks?.length) {
          tracks = takeUpTo200(tracks, fullAlbum.tracks)
          if (tracks.length >= 200) break
        }
      }

      if (tracks.length) {
        await playRandomOrTracks({ tracks })
      }
    } finally {
      loader.hideLoading()
    }
  }

  const shuffleMostPlayed = async(api: API) => {
    loader.showLoading()
    try {
      const albums = pickRandom(await api.getAlbums('most-played', 50), 10)
      let tracks: Track[] = []

      for (const album of albums) {
        const fullAlbum = await api.getAlbumDetails(album.id)
        if (fullAlbum.tracks?.length) {
          tracks = takeUpTo200(tracks, fullAlbum.tracks)
          if (tracks.length >= 200) break
        }
      }

      if (tracks.length) {
        await playRandomOrTracks({ tracks })
      }
    } finally {
      loader.hideLoading()
    }
  }

  const shuffleFavouriteAlbums = async(api: API) => {
    loader.showLoading()
    try {
      const favourites = await api.getFavourites()
      const favouriteAlbums = pickRandom(favourites.albums, 10)
      if (!favouriteAlbums.length) return

      let tracks: Track[] = []

      for (const album of favouriteAlbums as { id: string }[]) {
        const fullAlbum = await api.getAlbumDetails(album.id)
        if (fullAlbum.tracks?.length) {
          tracks = takeUpTo200(tracks, fullAlbum.tracks)
          if (tracks.length >= 200) break
        }
      }

      if (tracks.length) {
        await playRandomOrTracks({ tracks })
      }
    } finally {
      loader.hideLoading()
    }
  }

  const shuffleFavouriteArtists = async(api: API) => {
    loader.showLoading()

    try {
      const favourites = await api.getFavourites()

      const allArtists = favourites.artists.map(a => a as { id: string })
      const randomArtists = pickRandom(allArtists, 10)

      if (!randomArtists.length) return

      let tracks: Track[] = []

      for (const artist of randomArtists as { id: string }[]) {
        let artistTracks: Track[] = []

        for await (const batch of api.getTracksByArtist(artist.id)) {
          artistTracks = artistTracks.concat(batch)
          if (artistTracks.length >= 20) break
        }

        tracks = tracks.concat(artistTracks.slice(0, 20))
        if (tracks.length >= 200) break
      }

      if (tracks.length) {
        await playRandomOrTracks({ tracks })
      }
    } finally {
      loader.hideLoading()
    }
  }

  const shufflePlaylists = async(api: API) => {
    loader.showLoading()
    try {
      const playlists = (await api.getPlaylists()).slice(0, 5)
      let allTracks: Track[] = []

      for (const p of playlists) {
        const full = await api.getPlaylist(p.id)
        if (full.tracks?.length) {
          allTracks = takeUpTo200(allTracks, full.tracks)
          if (allTracks.length >= 200) break
        }
      }

      if (allTracks.length) {
        await playRandomOrTracks({ tracks: allTracks })
      }
    } finally {
      loader.hideLoading()
    }
  }

  async function shuffleArtist(api: API, artistId: string) {
    loader.showLoading()
    try {
      let tracks: Track[] = []

      for await (const batch of api.getTracksByArtist(artistId)) {
        tracks = takeUpTo200(tracks, batch)
        if (tracks.length >= 200) break
      }

      await playRandomOrTracks({ tracks })
    } finally {
      loader.hideLoading()
    }
  }

  async function radioArtist(api: API, artistId: string) {
    await playRandomOrTracks({
      tracks: await api.getSimilarTracksByArtist(artistId, 50)
    })
  }

  const radioAlbum = async(
    api: API,
    tracks: Track[],
    artists: { id: string }[]
  ) => {
    if (!tracks?.length || !artists?.length) return

    playerStore.setShuffle(false)

    const similarTracks = await api.getSimilarTracksByArtist(
      artists[0].id,
      50
    )

    if (similarTracks?.length) {
      await playRandomOrTracks({ tracks: similarTracks })
    }
  }

  const shuffleAlbum = async(tracks: Track[]) => {
    if (!tracks?.length) return
    await playRandomOrTracks({ tracks: tracks.slice(0, 200) })
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
    shuffleArtist,
    radioArtist,
    shuffleAlbum,
    radioAlbum,
    luckyRadio,
  }
})
