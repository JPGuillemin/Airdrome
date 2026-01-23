import { inject, App, Plugin } from 'vue'
import { AuthService } from '@/auth/service'
import { orderBy, startCase, sumBy, uniqBy } from 'lodash-es'
import { toQueryString } from '@/shared/utils'
const apiSymbol = Symbol('')

export type AlbumSort =
  'a-z' |
  'recently-added'|
  'recently-played' |
  'most-played' |
  'random'

export function useApi(): API {
  return inject(apiSymbol) as API
}

export function createApi(auth: AuthService): API & Plugin {
  const instance = new API(auth)
  return Object.assign(instance, {
    install: (app: App) => {
      app.config.globalProperties.$api = instance
      app.provide(apiSymbol, instance)
    }
  })
}

export interface Track {
  id: string
  title: string
  duration: number
  favourite: boolean
  image?: string
  url?: string
  track?: number
  album?: string
  albumId?: string
  artists: {name: string, id: string}[]
  isStream?: boolean
  isPodcast?: boolean
  isUnavailable?: boolean
  playCount?: number
  replayGain?: {
    trackGain: number
    trackPeak: number
    albumGain: number
    albumPeak: number
  }
}

export interface Genre {
  id: string
  name: string
  albumCount: number
  trackCount: number
}
export interface AlbumGenre {
  name: string
}

export interface Album {
  id: string
  name: string
  description?: string
  artists: {name: string, id: string}[]
  year: number
  favourite: boolean
  genres: AlbumGenre[]
  image?: string
  lastFmUrl?: string
  musicBrainzUrl?: string
  tracks?: Track[]
  releaseType?: string
}

export interface Artist {
  id: string
  name: string
  description?: string
  genres: AlbumGenre[]
  albumCount: number
  trackCount: number
  favourite: boolean
  lastFmUrl?: string
  musicBrainzUrl?: string
  topTracks?: Track[]
  similarArtist?: Artist[]
  albums?: Album[]
  image?: string
}

export interface SearchResult {
  artists: Artist[]
  albums: Album[]
  tracks: Track[]
}

export interface Playlist {
  id: string
  name: string
  comment: string
  isPublic: boolean
  isReadOnly: boolean
  trackCount: number
  duration: number
  createdAt: string
  updatedAt: string
  image?: string
  tracks?: Track[]
}

export interface PlayQueue {
  tracks: Track[]
  currentTrack: number
  currentTrackPosition: number
}

export class OfflineError extends Error {
  constructor() {
    super('Offline')
    this.name = 'OfflineError'
  }
}

export class UnsupportedOperationError extends Error { }

export class SubsonicError extends Error {
  readonly code: string | null
  constructor(message: string, code: string | null) {
    super(message)
    this.name = 'SubsonicError'
    this.code = code
  }
}

export class API {
  private readonly fetch: (path: string, params?: any) => Promise<any>
  private readonly clientName = 'Airdrome'

  constructor(private auth: AuthService) {
    this.fetch = async(path: string, params: any) => {
      params = { ...params, v: '1.16.1', f: 'json', c: this.clientName }

      const request = this.auth.serverInfo?.extensions.includes('formPost')
        ? new Request(`${this.auth.server}/${path}`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `${toQueryString(params)}&${this.auth.urlParams}`,
        })
        : new Request(
            `${this.auth.server}/${path}?${toQueryString(params)}&${this.auth.urlParams}`,
            { method: 'GET', headers: { Accept: 'application/json' } }
        )

      try {
        const response = await window.fetch(request)

        if (!response.ok) {
          if (response.status === 501) {
            throw new UnsupportedOperationError(
              `Request failed with status ${response.status}`
            )
          }
          throw new Error(`Request failed with status ${response.status}`)
        }

        const json = await response.json()
        const subsonicResponse = json['subsonic-response']

        if (subsonicResponse.status !== 'ok') {
          throw new SubsonicError(
            subsonicResponse.error?.message || subsonicResponse.status,
            subsonicResponse.error?.code ?? null
          )
        }

        return subsonicResponse
      } catch (err: any) {
        if (
          err instanceof TypeError &&
          !navigator.onLine
        ) {
          console.info('[Offline mode] API request skipped:', path)
          throw new OfflineError()
        }
        throw err
      }
    }
  }

  async getGenres() {
    const response = await this.fetch('rest/getGenres', {})
    return (response.genres.genre || [])
      .map((item: any) => ({
        id: item.value,
        name: item.value,
        albumCount: item.albumCount ?? 0,
        trackCount: item.songCount ?? 0,
      }))
      .sort((a: any, b:any) => b.albumCount - a.albumCount)
  }

  async getAlbumsByGenre(
    id: string,
    size: number,
    offset = 0,
    random = false,
  ) {
    const params = {
      type: 'byGenre',
      genre: id,
      size,
      offset,
    }
    const response = await this.fetch('rest/getAlbumList2', params)
    const albums = (response.albumList2?.album || []).map(
      this.normalizeAlbum,
      this,
    )
    if (!random) {
      return albums
    }
    // Fisher–Yates shuffle (in-place)
    for (let i = albums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[albums[i], albums[j]] = [albums[j], albums[i]]
    }
    return albums
  }

  async getTracksByGenre(id: string, size: number, offset = 0) {
    const params = {
      genre: id,
      count: size,
      offset,
    }
    const response = await this.fetch('rest/getSongsByGenre', params)
    return (response.songsByGenre?.song || []).map(this.normalizeTrack, this)
  }

  async getSimilarTracksByArtist(id: string, size = 50): Promise<Track[]> {
    const artist = await this.getArtistDetails(id)
    const albums = artist.albums || []
    if (!albums.length) return []
    const genreWeightMap: Record<string, number> = {}
    for (const alb of albums) {
      for (const g of alb.genres || []) {
        genreWeightMap[g.name] = (genreWeightMap[g.name] || 0) + 1
      }
    }
    const weightedGenres = Object.entries(genreWeightMap)
      .flatMap(([genre, count]) => Array(count).fill(genre))
    if (!weightedGenres.length) return []
    const chosenGenre =
      weightedGenres[Math.floor(Math.random() * weightedGenres.length)]
    return this.getRandomTracks({ genre: chosenGenre, size })
  }

  async getArtists(): Promise<Artist[]> {
    const response = await this.fetch('rest/getArtists')
    return (response.artists?.index || [])
      .flatMap((index: any) => index.artist)
      .map(this.normalizeArtist, this)
  }

  async getAlbums(sort: AlbumSort, size: number, offset = 0): Promise<Album[]> {
    const type = {
      'a-z': 'alphabeticalByName',
      'recently-added': 'newest',
      'recently-played': 'recent',
      'most-played': 'frequent',
      random: 'random',
    }[sort]

    const params = { type, offset, size }
    const response = await this.fetch('rest/getAlbumList2', params)
    const albums = response.albumList2?.album || []
    return albums.map(this.normalizeAlbum, this)
  }

  async getArtistDetails(id: string): Promise<Artist> {
    const info2Promise = this.fetch('rest/getArtistInfo2', { id }).then(r => r.artistInfo2)
    const artist = await this.fetch('rest/getArtist', { id }).then(r => r.artist)
    const topSongs = await this.fetch('rest/getTopSongs', { artist: artist.name }).then(r => r.topSongs?.song)
    const info2 = await info2Promise
    return this.normalizeArtist({ ...info2, ...artist, album: artist.album, topSongs })
  }

  async * getTracksByArtist(id: string): AsyncGenerator<Track[]> {
    const artist = await this.fetch('rest/getArtist', { id }).then(r => r.artist)
    const albumIds = orderBy(artist.album || [], x => x.year || 0, 'desc').map(x => x.id)
    const pending = albumIds.map(albumId => this.getAlbumDetails(albumId))
    for (const promise of pending) {
      const { tracks } = await promise
      if (tracks?.length) yield tracks
    }
  }

  async getAlbumDetails(id: string): Promise<Album> {
    const params = { id }
    const [info, info2] = await Promise.all([
      this.fetch('rest/getAlbum', params),
      this.fetch('rest/getAlbumInfo2', params),
    ])
    return this.normalizeAlbum({ ...info.album, ...info2.albumInfo })
  }

  async getPlaylists() {
    const response = await this.fetch('rest/getPlaylists')
    return (response.playlists?.playlist || []).map(this.normalizePlaylist, this)
  }

  async getPlaylist(id: string): Promise<Playlist> {
    if (id === 'random') {
      const tracks = await this.getRandomTracks()
      const duration = sumBy(tracks, 'duration')
      return {
        id,
        name: 'Random',
        comment: '',
        createdAt: '',
        updatedAt: '',
        tracks,
        trackCount: tracks.length,
        duration,
        isPublic: false,
        isReadOnly: true,
      }
    }
    const response = await this.fetch('rest/getPlaylist', { id })
    return {
      ...this.normalizePlaylist(response.playlist),
      tracks: (response.playlist.entry || []).map(this.normalizeTrack, this),
    }
  }

  async createPlaylist(name: string, tracks?: string[]) {
    await this.fetch('rest/createPlaylist', { name, songId: tracks })
    return this.getPlaylists()
  }

  async editPlaylist(playlistId: string, name: string, comment: string, isPublic: boolean) {
    const params = {
      playlistId,
      name,
      comment,
      public: isPublic,
    }
    await this.fetch('rest/updatePlaylist', params)
  }

  async deletePlaylist(id: string) {
    await this.fetch('rest/deletePlaylist', { id })
  }

  async addToPlaylist(playlistId: string, tracks: string[]) {
    const params = {
      playlistId,
      songIdToAdd: tracks,
    }
    await this.fetch('rest/updatePlaylist', params)
  }

  async removeFromPlaylist(playlistId: string, index: number) {
    const params = {
      playlistId,
      songIndexToRemove: index,
    }
    await this.fetch('rest/updatePlaylist', params)
  }

  async getPlayQueue(): Promise<PlayQueue> {
    const response = await this.fetch('rest/getPlayQueue')
    const tracks = (response.playQueue?.entry || []).map(this.normalizeTrack, this) as Track[]
    const currentTrackId = response.playQueue?.current?.toString()
    const currentTrack = tracks.findIndex(track => track.id === currentTrackId) ?? 0
    return {
      tracks,
      currentTrack,
      currentTrackPosition: (response.playQueue?.position || 0) / 1000,
    }
  }

  async savePlayQueue(
    tracks: Track[],
    currentTrack: Track | null,
    currentTime: number | null
  ) {
    try {
      const tracksIds = tracks.filter(t => !t.isStream).map(t => t.id)

      await this.fetch('rest/savePlayQueue', {
        id: tracksIds,
        current: !currentTrack?.isStream ? currentTrack?.id : undefined,
        position:
          currentTime != null
            ? Math.round(currentTime * 1000)
            : undefined,
      })
    } catch (err: any) {
      if (err instanceof OfflineError) return
      if (err.code === 0 || err.code === 10) return
      throw err
    }
  }

  async getRandomTracks(
    {
      size = 200,
      genre,
      fromYear,
      toYear,
    }: {
      size?: number
      genre?: string
      fromYear?: number
      toYear?: number
    } = {}
  ): Promise<Track[]> {
    const params: Record<string, any> = {
      size,
    }

    if (genre !== undefined) params.genre = genre
    if (fromYear !== undefined) params.fromYear = fromYear
    if (toYear !== undefined) params.toYear = toYear

    const response = await this.fetch('rest/getRandomSongs', params)
    return (response.randomSongs?.song || []).map(this.normalizeTrack, this)
  }

  async getFavourites() {
    const response = await this.fetch('rest/getStarred2')
    return {
      albums: (response.starred2?.album || []).map(this.normalizeAlbum, this),
      artists: (response.starred2?.artist || []).map(this.normalizeArtist, this),
      tracks: (response.starred2?.song || []).map(this.normalizeTrack, this)
    }
  }

  async getRecentlyPlayedTracks(size = 200) {
    const albums = await this.getAlbums('recently-played', size)
    return albums.flatMap(a => a.tracks || [])
  }

  async addFavourite(id: string, type: 'track' | 'album' | 'artist') {
    const params = {
      id: type === 'track' ? id : undefined,
      albumId: type === 'album' ? id : undefined,
      artistId: type === 'artist' ? id : undefined,
    }
    await this.fetch('rest/star', params)
  }

  async removeFavourite(id: string, type: 'track' | 'album' | 'artist') {
    const params = {
      id: type === 'track' ? id : undefined,
      albumId: type === 'album' ? id : undefined,
      artistId: type === 'artist' ? id : undefined,
    }
    await this.fetch('rest/unstar', params)
  }

  async search(query: string, type: string | null, size: number, offset?: number): Promise<SearchResult> {
    const params = {
      query,
      albumCount: !type || type === 'album' ? size : 0,
      artistCount: !type || type === 'artist' ? size : 0,
      songCount: !type || type === 'track' ? size : 0,
      albumOffset: offset ?? 0,
      artistOffset: offset ?? 0,
      songOffset: offset ?? 0,
    }
    const data = await this.fetch('rest/search3', params)
    return {
      albums: (data.searchResult3.album || []).map(this.normalizeAlbum, this),
      artists: (data.searchResult3.artist || []).map(this.normalizeArtist, this),
      tracks: (data.searchResult3.song || []).map(this.normalizeTrack, this),
    }
  }

  async scan(): Promise<void> {
    return this.fetch('rest/startScan')
  }

  async getScanStatus(): Promise<boolean> {
    const response = await this.fetch('rest/getScanStatus')
    return response.scanStatus.scanning
  }

  async scrobble(id: string): Promise<void> {
    try {
      await this.fetch('rest/scrobble', { id, submission: true })
    } catch (err) {
      if (err instanceof OfflineError) return
      throw err
    }
  }

  async updateNowPlaying(id: string): Promise<void> {
    try {
      await this.fetch('rest/scrobble', { id, submission: false })
    } catch (err) {
      if (err instanceof OfflineError) return
      throw err
    }
  }

  private normalizeTrack(item: any): Track {
    const replayGain =
      Number.isFinite(item.replayGain?.trackGain) &&
      Number.isFinite(item.replayGain?.albumGain) &&
      item.replayGain?.trackPeak > 0 &&
      item.replayGain?.albumPeak > 0
        ? item.replayGain
        : null

    return {
      id: item.id,
      title: item.title,
      duration: item.duration,
      favourite: !!item.starred,
      track: item.track,
      album: item.album,
      albumId: item.albumId,
      artists: item.artists?.length
        ? item.artists
        : [{ id: item.artistId, name: item.artist }],
      url: this.getStreamUrl(item.id),
      image: this.getCoverArtUrl(item),
      replayGain,
    }
  }

  private normalizeGenres(item: any): AlbumGenre[] {
    if (item.genres?.length) {
      return item.genres
    }
    if (item.genre) {
      return [{ name: item.genre }]
    }
    return []
  }

  private normalizeAlbum(item: any): Album {
    return {
      id: item.id,
      name: item.name,
      description: (item.notes || '').replace(/<a[^>]*>.*?<\/a>/gm, ''),
      artists: item.artists?.length
        ? item.artists
        : [{ id: item.artistId, name: item.artist }],
      image: this.getCoverArtUrl(item),
      year: item.year || 0,
      favourite: !!item.starred,
      genres: this.normalizeGenres(item),
      lastFmUrl: item.lastFmUrl,
      musicBrainzUrl: item.musicBrainzId
        ? `https://musicbrainz.org/release/${item.musicBrainzId}`
        : undefined,
      tracks: (item.song || []).map(this.normalizeTrack, this),
      releaseType: this.normalizeReleaseType(item),
    }
  }

  private normalizeReleaseType(item: any): string {
    if (item.isCompilation) {
      return 'COMPILATION'
    }
    if (!item.releaseTypes?.length || item.releaseTypes[0] === '') {
      return 'ALBUM'
    }
    const value = item.releaseTypes[0].toUpperCase()
    if (['ALBUM', 'EP', 'SINGLE', 'COMPILATION'].includes(value)) {
      return value
    }
    return startCase(item.releaseTypes[0].toLowerCase())
  }

  private normalizeArtist(item: any): Artist {
    const rawAlbums = item.album
      ? (Array.isArray(item.album) ? item.album : [item.album])
      : []
    const getAlbumTime = (a: any) => {
      const released = a?.released ? Date.parse(a.released) : NaN
      if (!isNaN(released)) return released
      const year = Number(a?.year)
      if (!isNaN(year)) return new Date(year, 0, 1).getTime()
      return Number.MIN_SAFE_INTEGER
    }
    const sortedAlbums = [...rawAlbums].sort(
      (a, b) => getAlbumTime(b) - getAlbumTime(a)
    )
    return {
      id: item.id,
      name: item.name,
      description: (item.biography || '').replace(/<a[^>]*>.*?<\/a>/gm, ''),
      genres: uniqBy(sortedAlbums.flatMap(this.normalizeGenres, this), 'name'),
      albumCount: item.albumCount,
      trackCount: rawAlbums.reduce((acc, a) => acc + (a.songCount || 0), 0),
      favourite: !!item.starred,
      lastFmUrl: item.lastFmUrl,
      musicBrainzUrl: item.musicBrainzId
        ? `https://musicbrainz.org/artist/${item.musicBrainzId}`
        : undefined,
      albums: sortedAlbums.map(a => this.normalizeAlbum(a)),
      similarArtist: (item.similarArtist || []).map(this.normalizeArtist, this),
      topTracks: (item.topSongs || []).slice(0, 5).map(this.normalizeTrack, this),
      image: item.coverArt ? this.getCoverArtUrl(item) : item.artistImageUrl
    }
  }

  private normalizePlaylist(response: any): Playlist {
    return {
      id: response.id,
      name: response.name || '(Unnamed)',
      comment: response.comment || '',
      createdAt: response.created || '',
      updatedAt: response.changed || '',
      trackCount: response.songCount,
      duration: response.duration,
      image: response.songCount > 0 ? this.getCoverArtUrl(response) : undefined,
      isPublic: response.public,
      isReadOnly: false,
    }
  }

  getDownloadUrl(id: any) {
    const { server, urlParams } = this.auth
    return `${server}/rest/download` +
      `?id=${id}` +
      '&v=1.16.1' +
      `&${urlParams}` +
      `&c=${this.clientName}`
  }

  private getCoverArtUrl(item: any) {
    if (!item.coverArt) {
      return undefined
    }
    const { server, urlParams } = this.auth
    return `${server}/rest/getCoverArt` +
      `?id=${item.coverArt}` +
      '&v=1.16.1' +
      `&${urlParams}` +
      `&c=${this.clientName}` +
      '&size=300'
  }

  private getStreamUrl(id: any) {
    const { server, urlParams } = this.auth
    let bitRate = localStorage.getItem('streamQuality') || 128
    let audioCodec = 'opus'
    if (bitRate === '1000') {
      audioCodec = 'raw'
      bitRate = 0
    }
    return `${server}/rest/stream` +
      `?id=${id}` +
      '&v=1.16.1' +
      `&${urlParams}` +
      `&maxBitRate=${bitRate}` +
      `&format=${audioCodec}` +
      `&c=${this.clientName}`
  }
}
