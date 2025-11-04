import { defineStore } from 'pinia'
import { Album } from '@/shared/api'

export const useAlbumCacheStore = defineStore('albumCache', {
  actions: {
    async cacheAlbum(album: Album) {
      if (!album?.tracks?.length) {
        console.warn('No tracks to cache for this album.')
        return
      }

      const cache = await caches.open('airdrome-cache-v2')
      const trackUrls = album.tracks
        .map(t => t.url)
        .filter((u): u is string => typeof u === 'string' && u.length > 0)

      let done = 0
      const total = trackUrls.length
      console.info(`Caching ${total} tracks for album "${album.name}"...`)

      for (const url of trackUrls) {
        try {
          const match = await cache.match(url)
          if (!match) {
            const response = await fetch(url, { mode: 'cors' })
            if (response.ok) {
              await cache.put(url, response.clone())
              done++
              console.info(`Cached [${done}/${total}] ${url}`)
              window.dispatchEvent(new CustomEvent('audioCached', { detail: url }))
            } else {
              console.warn(`Failed to fetch: ${url} (${response.status})`)
            }
          } else {
            console.info(`Already cached: ${url}`)
          }
        } catch (err) {
          console.warn(`Error caching ${url}:`, err)
        }
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      console.info(`Finished caching album "${album.name}" (${done}/${total})`)
    },

    async clearAlbumCache(album: Album) {
      if (!album?.tracks?.length) {
        console.warn('No tracks found for this album.')
        return
      }

      const cache = await caches.open('airdrome-cache-v2')
      const trackUrls = album.tracks
        .map(t => t.url)
        .filter((u): u is string => typeof u === 'string' && u.length > 0)

      let deleted = 0
      for (const url of trackUrls) {
        try {
          const success = await cache.delete(url)
          if (success) {
            deleted++
            console.info(`Removed from cache: ${url}`)
          }
        } catch (err) {
          console.warn(`Failed to remove ${url} from cache:`, err)
        }
      }

      console.info(`Cleared ${deleted}/${trackUrls.length} cached tracks for album "${album.name}".`)

      window.dispatchEvent(
        new CustomEvent('albumCacheCleared', { detail: { albumId: album.id, name: album.name, deleted } })
      )
    },
  },
})
