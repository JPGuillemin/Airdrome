// radio.ts
import { defineStore } from 'pinia'
import { nextTick } from 'vue'
import router from '@/main'
import { useLoader } from '@/shared/loader'
import { usePlayerStore } from '@/player/store'
import type { API, Track } from '@/shared/api'

/** Number of tracks a radio queues (initial queue and extensions). */
const RADIO_SIZE = 50

export const useRadioStore = defineStore('radio', {
  actions: {
    // -------- HELPERS --------
    takeUpToX(acc: Track[], next: Track[]): Track[] {
      if (acc.length >= RADIO_SIZE) return acc
      const remaining = RADIO_SIZE - acc.length
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

    /** Genre of a track: explicit `genre` if present, else the first genre of its album. */
    async resolveGenre(track: Track): Promise<string | undefined> {
      const direct = (track as any).genre as string | undefined
      if (direct) return direct
      if (!track.albumId) return undefined
      try {
        const album = await this.api.getAlbumDetails(track.albumId)
        return album.genres?.[0]?.name
      } catch (err) {
        console.warn('Radio: failed to resolve album genre', err)
        return undefined
      }
    },

    /**
     * Append random tracks (same genre as `track`) to the END of the current
     * queue. Does not replace the queue, start playback or change route.
     * Returns true if at least one track was appended.
     */
    async extendQueue(track: Track, size = RADIO_SIZE): Promise<boolean> {
      if (!track) return false
      const playerStore = usePlayerStore()

      const genre = await this.resolveGenre(track)
      if (!genre) {
        console.warn('Radio: no genre found, cannot extend queue')
        return false
      }

      const random = await this.api.getRandomTracks({ genre, size })
      const queued = new Set(playerStore.queue.map(t => t.id))
      const fresh = (random ?? []).filter(t => !queued.has(t.id))
      if (!fresh.length) return false

      playerStore.appendTracks(fresh)
      return true
    },

    // -------- RADIOS --------
    async shuffleGenre(genreId: string) {
      await this.playRandomOrTracks({ params: { genre: genreId, size: RADIO_SIZE } })
    },

    async shuffleMood(genreName: string) {
      await this.playRandomOrTracks({ params: { genre: genreName, size: RADIO_SIZE } })
    },

    async luckyRadio() {
      await this.playRandomOrTracks({ params: { size: RADIO_SIZE } })
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
            tracks = this.takeUpToX(tracks, fullAlbum.tracks)
            if (tracks.length >= RADIO_SIZE) break
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
            tracks = this.takeUpToX(tracks, fullAlbum.tracks)
            if (tracks.length >= RADIO_SIZE) break
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
            tracks = this.takeUpToX(tracks, fullAlbum.tracks)
            if (tracks.length >= RADIO_SIZE) break
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
            tracks = this.takeUpToX(tracks, fullAlbum.tracks)
            if (tracks.length >= RADIO_SIZE) break
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
          if (tracks.length >= RADIO_SIZE) break
        }

        // Hard cap: the last artist can push us past RADIO_SIZE
        tracks = tracks.slice(0, RADIO_SIZE)

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
            allTracks = this.takeUpToX(allTracks, full.tracks)
            if (allTracks.length >= RADIO_SIZE) break
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
          tracks = this.takeUpToX(tracks, batch)
          if (tracks.length >= RADIO_SIZE) break
        }
        await this.playRandomOrTracks({ tracks })
      } finally {
        loader.hideLoading()
      }
    },

    async radioArtist(artistId: string) {
      await this.playRandomOrTracks({
        tracks: await this.api.getSimilarTracksByArtist(artistId, RADIO_SIZE)
      })
    },

    async radioAlbum(tracks: Track[], artists: { id: string }[]) {
      if (!tracks?.length || !artists?.length) return

      const playerStore = usePlayerStore()
      playerStore.setShuffle(false)

      const similarTracks = await this.api.getSimilarTracksByArtist(artists[0].id, RADIO_SIZE)
      if (similarTracks?.length) {
        await this.playRandomOrTracks({ tracks: similarTracks })
      }
    },

    async shuffleAlbum(tracks: Track[]) {
      if (!tracks?.length) return
      await this.playRandomOrTracks({ tracks: tracks.slice(0, RADIO_SIZE) })
    }
  }
})
