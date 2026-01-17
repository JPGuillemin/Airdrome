import { defineStore } from 'pinia'
import { nextTick } from 'vue'
import router from '@/main'
import { useLoader } from '@/shared/loader'
import { usePlayerStore } from '@/player/store'
import type { Track, API } from '@/shared/api'

export const useRadioStore = defineStore('radio', () => {
  const playerStore = usePlayerStore()
  const loader = useLoader()

  // -------- PERFORMANCE HELPER (new) --------
  function takeUpTo200(acc: Track[], next: Track[]): Track[] {
    if (acc.length >= 200) return acc
    const remaining = 200 - acc.length
    return acc.concat(next.slice(0, remaining))
  }

  // -------- CORE RANDOM RADIO --------

  const playRandom = async(
    api: API,
    params: Parameters<API['getRandomTracks']>[0]
  ) => {
    loader.showLoading()
    let shouldRoute = false

    try {
      const tracks = await api.getRandomTracks(params)
      if (!tracks.length) return

      await playerStore.playNow(tracks)
      shouldRoute = true
    } finally {
      loader.hideLoading()
      if (shouldRoute) {
        nextTick(() => router.push({ name: 'queue' }))
      }
    }
  }

  const shuffleGenre = async(api: API, genreId: string) => {
    return playRandom(api, { genre: genreId, size: 200 })
  }

  // -------- RECENT / POPULAR (FAST + CAPPED) --------

  const shuffleRecentlyPlayed = async(api: API) => {
    loader.showLoading()

    try {
      const albums = (await api.getAlbums('recently-played', 50)).slice(0, 5)

      let tracks: Track[] = []

      for (const album of albums) {
        const fullAlbum = await api.getAlbumDetails(album.id)
        if (fullAlbum.tracks?.length) {
          tracks = takeUpTo200(tracks, fullAlbum.tracks)
          if (tracks.length >= 200) break
        }
      }

      if (tracks.length) {
        await playerStore.shuffleNow(tracks)
      }
    } finally {
      loader.hideLoading()
    }
  }

  const shuffleRecentlyAdded = async(api: API) => {
    loader.showLoading()

    try {
      const albums = (await api.getAlbums('recently-added', 50)).slice(0, 5)

      let tracks: Track[] = []

      for (const album of albums) {
        const fullAlbum = await api.getAlbumDetails(album.id)
        if (fullAlbum.tracks?.length) {
          tracks = takeUpTo200(tracks, fullAlbum.tracks)
          if (tracks.length >= 200) break
        }
      }

      if (tracks.length) {
        await playerStore.shuffleNow(tracks)
      }
    } finally {
      loader.hideLoading()
    }
  }

  const shuffleMostPlayed = async(api: API) => {
    loader.showLoading()

    try {
      const albums = (await api.getAlbums('most-played', 50)).slice(0, 5)

      let tracks: Track[] = []

      for (const album of albums) {
        const fullAlbum = await api.getAlbumDetails(album.id)
        if (fullAlbum.tracks?.length) {
          tracks = takeUpTo200(tracks, fullAlbum.tracks)
          if (tracks.length >= 200) break
        }
      }

      if (tracks.length) {
        await playerStore.shuffleNow(tracks)
      }
    } finally {
      loader.hideLoading()
    }
  }

  const shuffleMood = async(api: API, genreName: string) => {
    return playRandom(api, { genre: genreName, size: 200 })
  }

  // -------- FAVOURITES (FAST + CAPPED) --------

  const shuffleFavouriteAlbums = async(api: API) => {
    loader.showLoading()

    try {
      const favourites = await api.getFavourites()
      const favouriteAlbums = favourites.albums.slice(0, 5)

      if (!favouriteAlbums.length) return

      let tracks: Track[] = []

      for (const album of favouriteAlbums) {
        const fullAlbum = await api.getAlbumDetails(album.id)

        if (fullAlbum.tracks?.length) {
          tracks = takeUpTo200(tracks, fullAlbum.tracks)
          if (tracks.length >= 200) break
        }
      }

      if (tracks.length) {
        await playerStore.shuffleNow(tracks)
      }
    } finally {
      loader.hideLoading()
    }
  }

  const shuffleFavouriteArtists = async(api: API) => {
    loader.showLoading()

    try {
      const favourites = await api.getFavourites()
      const favouriteArtists = favourites.artists.slice(0, 5)

      if (!favouriteArtists.length) return

      let tracks: Track[] = []

      for (const artist of favouriteArtists) {
        for await (const batch of api.getTracksByArtist(artist.id)) {
          tracks = takeUpTo200(tracks, batch)
          if (tracks.length >= 200) break
        }
        if (tracks.length >= 200) break
      }

      if (tracks.length) {
        await playerStore.shuffleNow(tracks)
      }
    } finally {
      loader.hideLoading()
    }
  }

  // -------- PLAYLISTS (FAST + CAPPED) --------

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
        await playerStore.shuffleNow(allTracks)
      }
    } finally {
      loader.hideLoading()
    }
  }

  // -------- ARTIST / ALBUM RADIO --------

  async function shuffleArtist(api: API, artistId: string) {
    loader.showLoading()
    try {
      let tracks: Track[] = []

      for await (const batch of api.getTracksByArtist(artistId)) {
        tracks = takeUpTo200(tracks, batch)
        if (tracks.length >= 200) break
      }

      await playerStore.shuffleNow(tracks)
    } finally {
      loader.hideLoading()
    }
  }

  async function radioArtist(api: API, artistId: string) {
    loader.showLoading()
    try {
      const tracks = await api.getSimilarTracksByArtist(artistId, 50)
      await playerStore.playNow(tracks)
    } finally {
      loader.hideLoading()
    }
  }

  const radioAlbum = async(
    api: API,
    tracks: Track[],
    artists: { id: string }[]
  ) => {
    if (!tracks?.length || !artists?.length) return

    playerStore.setShuffle(false)
    loader.showLoading()
    let shouldRoute = false

    try {
      const artistId = artists[0].id
      const similarTracks = await api.getSimilarTracksByArtist(artistId, 50)

      if (!similarTracks?.length) return

      await playerStore.playNow(similarTracks)
      shouldRoute = true
    } finally {
      loader.hideLoading()
      if (shouldRoute) nextTick(() => router.push({ name: 'queue' }))
    }
  }

  const shuffleAlbum = async(tracks: Track[]) => {
    if (!tracks?.length) return
    loader.showLoading()
    try {
      await playerStore.shuffleNow(tracks.slice(0, 200))
    } finally {
      loader.hideLoading()
    }
  }

  const luckyRadio = async(api: API) => {
    return playRandom(api, { size: 200 })
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
