#!/usr/bin/env bash
#
# Build a signed Android APK for Airdrome with Capacitor.
#
# Requirements:
#   - Node.js 22+
#   - JDK 21
#   - Android SDK / command-line tools (ANDROID_HOME or local.properties)
#
# The same `dist/` produced here is still a complete PWA: `npm run build`
# alone is enough to deploy the web version.
#
# Usage:
#   ./build-apk.sh
#   SKIP_PWA_BUILD=1 ./build-apk.sh
#   BUILD_AAB=1 ./build-apk.sh
#
# Release signing (optional):
#   Place android/app/airdrome-release.keystore and export STORE_PASSWORD /
#   KEY_PASSWORD / KEY_ALIAS. Without a keystore the release build falls back
#   to the debug signing key so a clean checkout still produces an APK.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# Android toolchain + signing environment
# ---------------------------------------------------------------------------
export JAVA_HOME="${JAVA_HOME:-/tmp/opencode/jdk21}"
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME="${ANDROID_HOME:-/home/hyperion/.bubblewrap/android_sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"

# Keep signing passwords out of git. Copy .android-signing.env.example to
# .android-signing.env (gitignored) and fill it in, or export the variables
# in your shell before running the build.
if [ -f "$SCRIPT_DIR/.android-signing.env" ]; then
  . "$SCRIPT_DIR/.android-signing.env"
fi

export STORE_PASSWORD="${STORE_PASSWORD:-}"
export KEY_PASSWORD="${KEY_PASSWORD:-}"
export KEY_ALIAS="${KEY_ALIAS:-airdrome}"

if [ -f "$SCRIPT_DIR/android/app/airdrome-release.keystore" ] &&
   { [ -z "${STORE_PASSWORD:-}" ] || [ -z "${KEY_PASSWORD:-}" ]; }; then
  echo "A release keystore exists, but STORE_PASSWORD / KEY_PASSWORD are empty." >&2
  echo "Copy .android-signing.env.example to .android-signing.env and fill it in." >&2
  exit 1
fi

if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "JAVA_HOME does not point to a JDK: $JAVA_HOME" >&2
  echo "Set JAVA_HOME to a JDK 21 installation." >&2
  exit 1
fi

if [ ! -d "$ANDROID_HOME" ]; then
  echo "ANDROID_HOME does not exist: $ANDROID_HOME" >&2
  echo "Set ANDROID_HOME to your Android SDK." >&2
  exit 1
fi

source VERSION

APP_NAME="${APP_NAME:-Airdrome}"
VERSION="${VERSION:-0.0.0}"
VERSION_CODE="${VERSION_CODE:-1}"

echo "Airdrome Capacitor Android build"
echo "  version: $VERSION ($VERSION_CODE)"
echo "  app:     $APP_NAME"

# ---------------------------------------------------------------------------
# 1. Build the PWA bundle (also the Capacitor webDir)
# ---------------------------------------------------------------------------

if [ "${SKIP_PWA_BUILD:-0}" != "1" ]; then
  echo "==> Building web bundle"
  export BASE_PATH="/"
  export VERSION

  if command -v yarn >/dev/null 2>&1 && [ -f yarn.lock ]; then
    yarn build
  else
    npm run build
  fi
else
  echo "==> Skipping web build"
fi

if [ ! -d dist ]; then
  echo "dist/ not found: run the web build first." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Copy the web bundle into the Android project and wire plugins
# ---------------------------------------------------------------------------

echo "==> Syncing Capacitor Android project"

# Never let a previous APK/AAB end up inside the web bundle: Capacitor copies
# all of dist/ into the Android assets, and a nested APK would bloat every
# subsequent build.
rm -f dist/*.apk dist/*.aab
rm -f android/app/src/main/assets/public/*.apk android/app/src/main/assets/public/*.aab

npx cap sync android

# ---------------------------------------------------------------------------
# 3. Build the APK
# ---------------------------------------------------------------------------

chmod +x android/gradlew

echo "==> Building release APK"
(
  cd android
  VERSION="$VERSION" VERSION_CODE="$VERSION_CODE" ./gradlew --no-daemon assembleRelease
)

ARTIFACTS_DIR="$SCRIPT_DIR/artifacts"
mkdir -p "$ARTIFACTS_DIR"

APK_SOURCE="android/app/build/outputs/apk/release/app-release.apk"
APK_TARGET="$ARTIFACTS_DIR/airdrome-${VERSION}.apk"

if [ ! -f "$APK_SOURCE" ]; then
  echo "Expected APK not found: $APK_SOURCE" >&2
  exit 1
fi

cp "$APK_SOURCE" "$APK_TARGET"
echo "==> APK: $APK_TARGET"

if [ "${BUILD_AAB:-0}" = "1" ]; then
  echo "==> Building Play Store bundle"
  (
    cd android
    VERSION="$VERSION" VERSION_CODE="$VERSION_CODE" ./gradlew --no-daemon bundleRelease
  )

  AAB_SOURCE="android/app/build/outputs/bundle/release/app-release.aab"
  AAB_TARGET="$ARTIFACTS_DIR/airdrome-${VERSION}.aab"

  if [ -f "$AAB_SOURCE" ]; then
    cp "$AAB_SOURCE" "$AAB_TARGET"
    echo "==> AAB: $AAB_TARGET"
  fi
fi
