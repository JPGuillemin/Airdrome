# Airdrome Music Player

![Screenshot](public/icon-128x128.png)

Airdrome is a modern React web Frontend for Mobile and Desktop supporting [navidrome](https://github.com/navidrome/navidrome), [airsonic-advanced](https://github.com/airsonic-advanced/airsonic-advanced), [NextCloud Music](https://apps.nextcloud.com/apps/music) and other [subsonic](https://github.com/topics/subsonic) compatible music servers.

## Features
- "Cockpit" home page with playback suggestions based on recent listenings
- Library browsing for albums, artist, genres, playlists, favourites
- "Radio like" dynamic playlists for anything : Genre, Album, Artist, Recent albums
- 3 high quality codec transcoding modes : FLAC / OPUS 192 / OPUS 128
- Gapless playback
- Full mediaSession integration
- Persistent queue, repeat, shuffle and Replay-Gain
- 4 color themes
- Responsive UI for desktop and mobile, will work on any browser
- Persistant cache and download for offline listening
- View, create, and edit playlists
- Full text search
- Favourites tagging

## Screenshots

<img src="screenshots/album-list.png" width="200" />  <img src="screenshots/album.png" width="200" />  <img src="screenshots/artist.png" width="200" />  <img src="screenshots/genre.png" width="200" />

<img src="screenshots/desktop.png" width="800" />

## Run from Docker Hub

```
$ docker run -d \
  --name=airdrome \
  --restart on-failure \
  --network=bridge \
  -p 8080:80 \
  h7p3ri0n/airdrome:latest

```

## Build your own Docker image

```
$ yarn install
$ yarn build
```

Bundle can be found in the `dist` folder.

Build docker image:

```
$ docker build -f docker/Dockerfile -t local/airdrome .

$ docker run -d \
  --name=airdrome \
  --restart on-failure \
  --network=bridge \
  -p 8080:80 \
  local/airdrome:latest

```

## OpenSubsonic endpoints

- getAlbumList2
- getArtistInfo2
- getAlbumInfo2
- getStarred2
- search3
- getSongsByGenre
- getRandomSongs
- getPlayQueue
- savePlayQueue
- getScanStatus
- startScan
- getOpenSubsonicExtensions

## Contributors

- [chunjiw](https://github.com/chunjiw) — Capacitor-based Android build

## License

Licensed under the [AGPLv3](LICENSE) license.
