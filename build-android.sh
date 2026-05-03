#!/bin/bash

source VERSION
echo "Building $VERSION ..."

rm -rf dist
yarn install
yarn build || exit 1

npx cap sync android || exit 1

(cd android && ./gradlew --no-daemon assembleRelease) || exit 1

# SRC=android/app/build/outputs/apk/debug/app-debug.apk
SRC=android/app/build/outputs/apk/release/app-release.apk
DST=airdrome-${VERSION}.apk
cp "$SRC" "$DST" || exit 1

echo
echo "APK built: $DST"
