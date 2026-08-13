// src/shared/musicbrainz.ts

const MB_API = 'https://musicbrainz.org/ws/2'
const LISTENBRAINZ = 'https://listenbrainz.org'

const MIN_SCORE = 80

interface MbArtist {
  id: string
  score?: number
}

interface MbReleaseGroup {
  id: string
  score?: number
}

interface ArtistSearchResponse {
  artists: MbArtist[]
}

interface ReleaseGroupSearchResponse {
  'release-groups': MbReleaseGroup[]
}

async function mbFetch<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(
      `MusicBrainz request failed: ${response.status} ${response.statusText}`,
    )
  }

  return response.json()
}

export async function getMbArtistId(
  artistName: string,
): Promise<string | null> {
  if (!artistName?.trim()) {
    return null
  }

  const url =
    `${MB_API}/artist/?query=${encodeURIComponent(artistName)}&fmt=json`

  const data = await mbFetch<ArtistSearchResponse>(url)

  const artist = data.artists?.[0]

  if (!artist) {
    return null
  }

  const score = Number(artist.score ?? 0)

  return score >= MIN_SCORE
    ? artist.id
    : null
}

export async function getArtistListenBrainzUrl(
  artistName: string,
): Promise<string | null> {
  const artistId = await getMbArtistId(artistName)

  return artistId
    ? `${LISTENBRAINZ}/artist/${artistId}`
    : `${LISTENBRAINZ}/explore/fresh-releases/`
}

export async function getMbAlbumId(
  artistName: string,
  albumName: string,
): Promise<string | null> {
  if (!artistName?.trim() || !albumName?.trim()) {
    return null
  }

  const query =
    `artist:"${artistName}" AND releasegroup:"${albumName}"`

  const url =
    `${MB_API}/release-group/?query=${encodeURIComponent(query)}&fmt=json`

  const data = await mbFetch<ReleaseGroupSearchResponse>(url)

  const releaseGroup = data['release-groups']?.[0]

  if (!releaseGroup) {
    return null
  }

  const score = Number(releaseGroup.score ?? 0)

  return score >= MIN_SCORE
    ? releaseGroup.id
    : null
}

export async function getAlbumListenBrainzUrl(
  artistName: string,
  albumName: string,
): Promise<string | null> {
  const releaseGroupId = await getMbAlbumId(
    artistName,
    albumName,
  )

  return releaseGroupId
    ? `${LISTENBRAINZ}/album/${releaseGroupId}`
    : `${LISTENBRAINZ}/explore/fresh-releases/`
}
