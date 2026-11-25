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

# Building as root leaves root-owned files in dist/ and the Android assets,
# which then breaks every normal-user build. Allow it only explicitly (for a
# disposable container, for example).
if [ "$(id -u)" -eq 0 ] && [ "${ALLOW_ROOT_BUILD:-0}" != "1" ]; then
  echo "Refusing to run as root: it would leave root-owned build files." >&2
  echo "Run ./build-apk.sh as your normal user, or set ALLOW_ROOT_BUILD=1" >&2
  echo "if this really is a disposable root-only environment." >&2
  exit 1
fi

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

if [ ! -x "$JAVA_HOME/bin/java" ] || ! "$JAVA_HOME/bin/java" -version >/dev/null 2>&1; then
  echo "JAVA_HOME does not point to a working JDK: $JAVA_HOME" >&2
  echo "Set JAVA_HOME to a complete JDK 21 installation." >&2
  echo "A common cause is a partially extracted archive (missing lib/libjli.so)." >&2
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
# 0. Refuse to build on top of root-owned leftovers
# ---------------------------------------------------------------------------

ROOT_OWNED="$(find dist android/app/src/main/assets \
  android/capacitor-cordova-android-plugins android/app/build \
  -user root -print -quit 2>/dev/null || true)"

if [ -n "$ROOT_OWNED" ]; then
  echo "Root-owned build files found (for example: $ROOT_OWNED)." >&2
  echo "Fix them once, then rerun this script as your normal user:" >&2
  echo "  sudo chown -R $(id -un):$(id -gn) dist android/app/src/main/assets android/capacitor-cordova-android-plugins android/app/build" >&2
  exit 1
fi

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

# Stale quarantined asset folders would otherwise be packaged into the APK.
rm -rf android/app/src/main/assets/public-old*
rm -rf android/app/src/main/assets/.public-root-owned*

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
