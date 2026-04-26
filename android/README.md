# Airdrome Android (Capacitor)

Standalone Android build of [Airdrome](../README.md) via [Capacitor](https://capacitorjs.com/). Web assets are bundled inside the APK — nothing loaded from a remote host at runtime.

This replaces the upstream Trusted Web Activity (TWA) build, which loaded its JS from a hardcoded remote host baked into the APK. That forced trust in a third party and triggered Chrome's Local Network Access prompt when the Subsonic server lived on a private network.

## Requirements

- Node 22+, yarn
- JDK 21
- Android SDK with `platforms;android-36` and `build-tools;36.0.0`
- `android/local.properties` with `sdk.dir=/path/to/android-sdk` (not committed)

## Build

From the repo root:

```
yarn install
JAVA_HOME=/usr/lib/jvm/java-21-openjdk ./build-android.sh
```

The script runs `yarn build`, `npx cap sync android`, and Gradle `assembleDebug`, then copies the APK to `airdrome-capacitor-<versionName>-debug.apk` in the repo root. Install with `adb install -r <path>`.

Or run the steps manually:

```
yarn install
yarn build
npx cap sync android
cd android
JAVA_HOME=/usr/lib/jvm/java-21-openjdk ./gradlew assembleDebug
```

Manual APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

## CORS

The webview origin inside the app is `https://localhost`. The Subsonic server's CORS must allow that origin — typically set via a reverse proxy (e.g. Traefik `customResponseHeaders`).

## Updating from upstream

```
git fetch upstream
git merge upstream/master
yarn install
./build-android.sh
```

`cap sync` copies the refreshed `dist/` into `android/app/src/main/assets/public/`, which is what gets packaged into the APK.
