#!/bin/bash

# Build the Android debug APK via Capacitor.
# Output: airdrome-capacitor-<versionName>-debug.apk in the project root.

rm -rf dist
yarn install
yarn build || exit 1

npx cap sync android || exit 1

(cd android && ./gradlew --no-daemon assembleDebug) || exit 1

VERSION=$(grep versionName android/app/build.gradle | sed -E 's/.*"(.+)".*/\1/')
SRC=android/app/build/outputs/apk/debug/app-debug.apk
DST=airdrome-${VERSION}.apk
cp "$SRC" "$DST" || exit 1

echo
echo "APK built: $DST"
