// src/shared/musicbrainz.js

var MB_API = 'https://musicbrainz.org/ws/2'
var LISTENBRAINZ = 'https://listenbrainz.org'

var MIN_SCORE = 80

/**
 * Fetch JSON from MusicBrainz and throw on non-2xx responses.
 *
 * @param {string} url
 * @returns {Promise<Object>}
 */
async function mbFetch(url) {
  var response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(
      'MusicBrainz request failed: ' + response.status + ' ' + response.statusText
    )
  }

  return response.json()
}

/**
 * Look up the MusicBrainz artist ID for a name.
 *
 * @param {string} artistName
 * @returns {Promise<string|null>}
 */
export async function getMbArtistId(artistName) {
  if (!artistName || !artistName.trim()) {
    return null
  }

  var url =
    MB_API + '/artist/?query=' + encodeURIComponent(artistName) + '&fmt=json'

  var data = await mbFetch(url)
  var artists = data.artists || []
  var artist = artists[0]

  if (!artist) {
    return null
  }

  var score = 0

  if (artist.score != null) {
    score = Number(artist.score)
  }

  if (score >= MIN_SCORE) {
    return artist.id
  }

  return null
}

/**
 * Return the ListenBrainz artist page, or the fresh-releases page when the
 * artist cannot be resolved.
 *
 * @param {string} artistName
 * @returns {Promise<string>}
 */
export async function getArtistListenBrainzUrl(artistName) {
  var artistId = await getMbArtistId(artistName)

  if (artistId) {
    return LISTENBRAINZ + '/artist/' + artistId
  }

  return LISTENBRAINZ + '/explore/fresh-releases/'
}

/**
 * Look up the MusicBrainz release-group ID for an artist/album pair.
 *
 * @param {string} artistName
 * @param {string} albumName
 * @returns {Promise<string|null>}
 */
export async function getMbAlbumId(artistName, albumName) {
  if (!artistName || !artistName.trim() || !albumName || !albumName.trim()) {
    return null
  }

  var query =
    'artist:"' + artistName + '" AND releasegroup:"' + albumName + '"'

  var url =
    MB_API + '/release-group/?query=' + encodeURIComponent(query) + '&fmt=json'

  var data = await mbFetch(url)
  var releaseGroups = data['release-groups'] || []
  var releaseGroup = releaseGroups[0]

  if (!releaseGroup) {
    return null
  }

  var score = 0

  if (releaseGroup.score != null) {
    score = Number(releaseGroup.score)
  }

  if (score >= MIN_SCORE) {
    return releaseGroup.id
  }

  return null
}

/**
 * Return the ListenBrainz album page, or the fresh-releases page when the
 * release group cannot be resolved.
 *
 * @param {string} artistName
 * @param {string} albumName
 * @returns {Promise<string>}
 */
export async function getAlbumListenBrainzUrl(artistName, albumName) {
  var releaseGroupId = await getMbAlbumId(artistName, albumName)

  if (releaseGroupId) {
    return LISTENBRAINZ + '/album/' + releaseGroupId
  }

  return LISTENBRAINZ + '/explore/fresh-releases/'
}
