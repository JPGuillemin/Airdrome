import { defineStore } from 'pinia'
import { nextTick } from 'vue'
import router from '@/main'
import { useLoader } from '@/shared/loader'
import { usePlayerStore } from '@/player/store'
import type { API, Track } from '@/shared/api'

export const useRadioStore = defineStore('radio', {
  actions: {
    // -------- HELPERS --------
    takeUpTo200(acc: Track[], next: Track[]): Track[] {
      if (acc.length >= 200) return acc
      const remaining = 200 - acc.length
      return acc.concat(next.slice(0, remaining))
    },

    shuffleTracks<T extends Track[]>(tracks: T): T {
      const copy = [...tracks] as T
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
      return copy
    },

    pickRandom<T>(arr: T[], count: number): T[] {
      const copy = [...arr]
      const result: T[] = []

      while (result.length < count && copy.length) {
        const i = Math.floor(Math.random() * copy.length)
        result.push(copy.splice(i, 1)[0])
      }
      return result
    },

    // -------- CORE --------
    async playRandomOrTracks(opts: { params?: Parameters<API['getRandomTracks']>[0]; tracks?: Track[] }) {
      const loader = useLoader()
      const playerStore = usePlayerStore()
      loader.showLoading()
      let shouldRoute = false

      try {
        let tracks: Track[] = []

        if (opts.params) {
          tracks = await this.api.getRandomTracks(opts.params)
        } else if (opts.tracks) {
          tracks = opts.tracks
        }

        if (!tracks?.length) return

        const randomized = this.shuffleTracks(tracks)
        await playerStore.playNow(randomized)
        shouldRoute = true
      } finally {
        loader.hideLoading()
        if (shouldRoute) {
          nextTick(() => router.push({ name: 'queue' }))
        }
      }
    },

    // -------- RADIOS --------
    async shuffleGenre(genreId: string) {
      await this.playRandomOrTracks({ params: { genre: genreId, size: 200 } })
    },

    async shuffleMood(genreName: string) {
      await this.playRandomOrTracks({ params: { genre: genreName, size: 200 } })
    },

    async luckyRadio() {
      await this.playRandomOrTracks({ params: { size: 200 } })
    },

    async shuffleRecentlyPlayed() {
      const loader = useLoader()
      loader.showLoading()
      try {
        const albums = this.pickRandom(await this.api.getAlbums('recently-played', 50), 10)
        let tracks: Track[] = []

        for (const album of albums) {
          const fullAlbum = await this.api.getAlbumDetails(album.id)
          if (fullAlbum.tracks?.length) {
            tracks = this.takeUpTo200(tracks, fullAlbum.tracks)
            if (tracks.length >= 200) break
          }
        }

        if (tracks.length) {
          await this.playRandomOrTracks({ tracks })
        }
      } finally {
        loader.hideLoading()
      }
    },

    async shuffleRecentlyAdded() {
      const loader = useLoader()
      loader.showLoading()
      try {
        const albums = this.pickRandom(await this.api.getAlbums('recently-added', 50), 10)
        let tracks: Track[] = []

        for (const album of albums) {
          const fullAlbum = await this.api.getAlbumDetails(album.id)
          if (fullAlbum.tracks?.length) {
            tracks = this.takeUpTo200(tracks, fullAlbum.tracks)
            if (tracks.length >= 200) break
          }
        }

        if (tracks.length) {
          await this.playRandomOrTracks({ tracks })
        }
      } finally {
        loader.hideLoading()
      }
    },

    async shuffleMostPlayed() {
      const loader = useLoader()
      loader.showLoading()
      try {
        const albums = this.pickRandom(await this.api.getAlbums('most-played', 50), 10)
        let tracks: Track[] = []

        for (const album of albums) {
          const fullAlbum = await this.api.getAlbumDetails(album.id)
          if (fullAlbum.tracks?.length) {
            tracks = this.takeUpTo200(tracks, fullAlbum.tracks)
            if (tracks.length >= 200) break
          }
        }

        if (tracks.length) {
          await this.playRandomOrTracks({ tracks })
        }
      } finally {
        loader.hideLoading()
      }
    },

    async shuffleFavouriteAlbums() {
      const loader = useLoader()
      loader.showLoading()
      try {
        const favourites = await this.api.getFavourites()
        const favouriteAlbums = this.pickRandom(favourites.albums, 10)
        if (!favouriteAlbums.length) return

        let tracks: Track[] = []
        for (const album of favouriteAlbums as { id: string }[]) {
          const fullAlbum = await this.api.getAlbumDetails(album.id)
          if (fullAlbum.tracks?.length) {
            tracks = this.takeUpTo200(tracks, fullAlbum.tracks)
            if (tracks.length >= 200) break
          }
        }

        if (tracks.length) {
          await this.playRandomOrTracks({ tracks })
        }
      } finally {
        loader.hideLoading()
      }
    },

    async shuffleFavouriteArtists() {
      const loader = useLoader()
      loader.showLoading()
      try {
        const favourites = await this.api.getFavourites()
        const randomArtists = this.pickRandom(favourites.artists, 10)
        if (!randomArtists.length) return

        let tracks: Track[] = []

        for (const artist of randomArtists as { id: string }[]) {
          let artistTracks: Track[] = []
          for await (const batch of this.api.getTracksByArtist(artist.id)) {
            artistTracks = artistTracks.concat(batch)
            if (artistTracks.length >= 20) break
          }
          tracks = tracks.concat(artistTracks.slice(0, 20))
          if (tracks.length >= 200) break
        }

        if (tracks.length) {
          await this.playRandomOrTracks({ tracks })
        }
      } finally {
        loader.hideLoading()
      }
    },

    async shufflePlaylists() {
      const loader = useLoader()
      loader.showLoading()
      try {
        const playlists = (await this.api.getPlaylists()).slice(0, 5)
        let allTracks: Track[] = []

        for (const p of playlists) {
          const full = await this.api.getPlaylist(p.id)
          if (full.tracks?.length) {
            allTracks = this.takeUpTo200(allTracks, full.tracks)
            if (allTracks.length >= 200) break
          }
        }

        if (allTracks.length) {
          await this.playRandomOrTracks({ tracks: allTracks })
        }
      } finally {
        loader.hideLoading()
      }
    },

    async shuffleArtist(artistId: string) {
      const loader = useLoader()
      loader.showLoading()
      try {
        let tracks: Track[] = []
        for await (const batch of this.api.getTracksByArtist(artistId)) {
          tracks = this.takeUpTo200(tracks, batch)
          if (tracks.length >= 200) break
        }
        await this.playRandomOrTracks({ tracks })
      } finally {
        loader.hideLoading()
      }
    },

    async radioArtist(artistId: string) {
      await this.playRandomOrTracks({
        tracks: await this.api.getSimilarTracksByArtist(artistId, 50)
      })
    },

    async radioAlbum(tracks: Track[], artists: { id: string }[]) {
      if (!tracks?.length || !artists?.length) return

      const playerStore = usePlayerStore()
      playerStore.setShuffle(false)

      const similarTracks = await this.api.getSimilarTracksByArtist(artists[0].id, 50)
      if (similarTracks?.length) {
        await this.playRandomOrTracks({ tracks: similarTracks })
      }
    },

    async shuffleAlbum(tracks: Track[]) {
      if (!tracks?.length) return
      await this.playRandomOrTracks({ tracks: tracks.slice(0, 200) })
    }
  }
})
