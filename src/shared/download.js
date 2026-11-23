// shared/download.js
//
// "Download" action from the track menu.
//   - PWA/browser: normal browser download.
//   - Android: native Filesystem download to public Documents/Airdrome, with
//     a Share-sheet fallback when the public folder is not writable (scoped
//     storage on newer Android versions).

import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Toast } from '@capacitor/toast'
import { isNative } from '@/shared/platform'

/**
 * Remove characters that are unsafe in a filename.
 *
 * @param {string} value
 * @returns {string}
 */
function safeName(value) {
  return String(value || 'track')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

/**
 * Pick a file extension from the track metadata / URL.
 *
 * @param {Object} track
 * @returns {string}
 */
function extensionFor(track) {
  var suffix = track.suffix || track.transcodedSuffix

  if (suffix) {
    return String(suffix).replace(/^\./, '')
  }

  return 'mp3'
}

/**
 * Download a track.
 *
 * @param {Object} api
 * @param {Object} track
 * @returns {Promise<void>}
 */
export async function downloadTrack(api, track) {
  var url = api.getDownloadUrl(track.id)

  if (!isNative) {
    window.location.href = url
    return
  }

  var artist = ''

  if (track.artists && track.artists.length) {
    artist = track.artists[0].name
  }

  var base = safeName((artist ? artist + ' - ' : '') + track.title)
  var filename = base + '.' + extensionFor(track)
  var relative = 'Airdrome/' + filename

  try {
    // downloadFile does not create intermediate directories on Android.
    await Filesystem.mkdir({
      path: 'Airdrome',
      directory: Directory.Documents,
      recursive: true
    })

    await Filesystem.downloadFile({
      url: url,
      path: relative,
      directory: Directory.Documents,
      recursive: true
    })

    try {
      await Toast.show({
        text: 'Saved to Documents/' + relative,
        duration: 'short'
      })
    } catch (error) {
      // Toast is cosmetic.
    }

    return
  } catch (error) {
    console.info('[download] Documents unavailable, using share sheet', error)
  }

  // Fallback: app cache + Android share sheet so the user can save the file
  // wherever they want (Downloads, Drive, a music app...).
  try {
    var cachePath = 'downloads/' + filename

    await Filesystem.mkdir({
      path: 'downloads',
      directory: Directory.Cache,
      recursive: true
    })

    await Filesystem.downloadFile({
      url: url,
      path: cachePath,
      directory: Directory.Cache,
      recursive: true
    })

    var uri = await Filesystem.getUri({
      path: cachePath,
      directory: Directory.Cache
    })

    await Share.share({
      title: track.title || filename,
      text: artist ? artist + ' - ' + track.title : track.title,
      files: [uri.uri],
      dialogTitle: 'Save track'
    })
  } catch (error) {
    console.warn('[download] failed', error)

    try {
      await Toast.show({
        text: 'Download failed',
        duration: 'long'
      })
    } catch (toastError) {
      // Toast is cosmetic.
    }
  }
}
