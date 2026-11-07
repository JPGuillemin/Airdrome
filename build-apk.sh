#!/usr/bin/env bash
#
# Build a signed Android APK for Airdrome as a Trusted Web Activity (TWA)
# using Google's Bubblewrap CLI.
#
# Requirements:
#   - Node.js 18+
#   - JDK 17 (keytool + Bubblewrap)
#   - Android SDK / command-line tools configured for Bubblewrap
#
# First-time Bubblewrap setup:
#   npx @bubblewrap/cli doctor
#   npx @bubblewrap/cli updateConfig --jdkPath=... --androidSdkPath=...
#
# Usage:
#   ./build-apk.sh
#   PWA_URL=https://example.com/ ./build-apk.sh
#   FORCE_MANIFEST=1 ./build-apk.sh
#   SKIP_PWA_BUILD=1 ./build-apk.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

source VERSION

APP_NAME="${APP_NAME:-Airdrome}"
PACKAGE_ID="${PACKAGE_ID:-org.zenwalk.darkstar.twa}"
PWA_URL="${PWA_URL:-https://jpguillemin.github.io/Airdrome/}"
START_URL="${START_URL:-/}"
TWA_DIR="${TWA_DIR:-android-twa}"
KEYSTORE_FILE="${KEYSTORE_FILE:-android.keystore}"
KEYSTORE_ALIAS="${KEYSTORE_ALIAS:-android}"
KEYSTORE_PASSWORD="${KEYSTORE_PASSWORD:-airdrome}"
KEY_PASSWORD="${KEY_PASSWORD:-airdrome}"
THEME_COLOR="${THEME_COLOR:-#09090b}"
BACKGROUND_COLOR="${BACKGROUND_COLOR:-#09090b}"
NAVIGATION_COLOR="${NAVIGATION_COLOR:-#09090b}"

# Normalize the PWA URL and derive the TWA host/start path.
PWA_URL="${PWA_URL%/}/"
HOST="$(printf '%s' "$PWA_URL" | sed -E 's#^https?://([^/]+).*#\1#')"
PWA_PATH="$(printf '%s' "$PWA_URL" | sed -E 's#^https?://[^/]+##')"
[ -z "$PWA_PATH" ] && PWA_PATH="/"

if [ "$START_URL" = "/" ]; then
  START_PATH="$PWA_PATH"
else
  START_PATH="${PWA_PATH%/}/${START_URL#/}"
fi

WEB_MANIFEST_URL="${PWA_URL}manifest.webmanifest"
ICON_URL="${PWA_URL}icon-512x512.png"
MASKABLE_ICON_URL="${PWA_URL}icon-512x512-maskable.png"

# Vite uses BASE_PATH to generate asset URLs.
BASE_PATH="$PWA_PATH"
export BASE_PATH

echo "Airdrome TWA build"
echo "  PWA:      $PWA_URL"
echo "  package:  $PACKAGE_ID"
echo "  version:  $VERSION ($VERSION_CODE)"
echo "  start:    $START_PATH"

# ---------------------------------------------------------------------------
# 1. Build the PWA
# ---------------------------------------------------------------------------

if [ "${SKIP_PWA_BUILD:-0}" != "1" ]; then
  echo "==> Building PWA"
  if command -v yarn >/dev/null 2>&1 && [ -f yarn.lock ]; then
    yarn build
  else
    npm run build
  fi

  # The TWA may be served from a sub-path (GitHub Pages, for example).
  # Keep the built web manifest consistent with Vite's BASE_PATH.
  if [ "$BASE_PATH" != "/" ] && [ -f dist/manifest.webmanifest ]; then
    echo "==> Rewriting manifest.webmanifest for $BASE_PATH"
    sed -i "s|\\(\"start_url\"[[:space:]]*:[[:space:]]*\\)\"/\"|\\1\"$BASE_PATH\"|" dist/manifest.webmanifest
    sed -i "s|\\(\"src\"[[:space:]]*:[[:space:]]*\\)\"/|\\1\"$BASE_PATH|g" dist/manifest.webmanifest
  fi
else
  echo "==> Skipping PWA build"
fi

# ---------------------------------------------------------------------------
# 2. Resolve the Bubblewrap CLI
# ---------------------------------------------------------------------------

if command -v bubblewrap >/dev/null 2>&1; then
  BUBBLEWRAP=(bubblewrap)
else
  echo "==> bubblewrap not found, using npx @bubblewrap/cli"
  BUBBLEWRAP=(npx --yes @bubblewrap/cli)
fi

# ---------------------------------------------------------------------------
# 3. Prepare the TWA project
# ---------------------------------------------------------------------------

mkdir -p "$TWA_DIR"
cd "$TWA_DIR"

if [ ! -f "$KEYSTORE_FILE" ]; then
  echo "==> Generating signing key $KEYSTORE_FILE"

  if ! command -v keytool >/dev/null 2>&1; then
    echo "keytool not found. Install JDK 17 or provide an existing keystore." >&2
    exit 1
  fi

  keytool -genkeypair \
    -keystore "$KEYSTORE_FILE" \
    -alias "$KEYSTORE_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass "$KEYSTORE_PASSWORD" \
    -keypass "$KEY_PASSWORD" \
    -dname "CN=$APP_NAME, OU=$APP_NAME, O=$APP_NAME, C=FR"
else
  echo "==> Reusing existing signing key $KEYSTORE_FILE"
fi

# Extract the SHA-256 fingerprint so the generated assetlinks.json is useful.
KEYSTORE_FINGERPRINT=""
if command -v keytool >/dev/null 2>&1; then
  KEYSTORE_FINGERPRINT="$(keytool -list -v \
    -keystore "$KEYSTORE_FILE" \
    -alias "$KEYSTORE_ALIAS" \
    -storepass "$KEYSTORE_PASSWORD" 2>/dev/null \
    | sed -n 's/^[[:space:]]*SHA256:[[:space:]]*//p' \
    | head -n 1 \
    | tr -d '[:space:]')"
fi

if [ -n "$KEYSTORE_FINGERPRINT" ]; then
  FINGERPRINTS_JSON="[{\"name\": \"android\", \"value\": \"$KEYSTORE_FINGERPRINT\"}]"
else
  FINGERPRINTS_JSON="[]"
fi

if [ ! -f twa-manifest.json ] || [ "${FORCE_MANIFEST:-0}" = "1" ]; then
  echo "==> Writing twa-manifest.json"

  cat > twa-manifest.json <<EOF
{
  "packageId": "$PACKAGE_ID",
  "host": "$HOST",
  "name": "$APP_NAME",
  "launcherName": "$APP_NAME",
  "display": "standalone",
  "themeColor": "$THEME_COLOR",
  "themeColorDark": "$THEME_COLOR",
  "navigationColor": "$NAVIGATION_COLOR",
  "navigationColorDark": "$NAVIGATION_COLOR",
  "navigationDividerColor": "$NAVIGATION_COLOR",
  "navigationDividerColorDark": "$NAVIGATION_COLOR",
  "backgroundColor": "$BACKGROUND_COLOR",
  "enableNotifications": false,
  "enableSiteSettingsShortcut": true,
  "startUrl": "$START_PATH",
  "iconUrl": "$ICON_URL",
  "maskableIconUrl": "$MASKABLE_ICON_URL",
  "webManifestUrl": "$WEB_MANIFEST_URL",
  "appVersion": "$VERSION",
  "appVersionCode": $VERSION_CODE,
  "signingKey": {
    "path": "$KEYSTORE_FILE",
    "alias": "$KEYSTORE_ALIAS"
  },
  "splashScreenFadeOutDuration": 300,
  "fallbackType": "customtabs",
  "features": {},
  "generatorApp": "bubblewrap-cli",
  "orientation": "default",
  "minSdkVersion": 24,
  "fingerprints": $FINGERPRINTS_JSON
}
EOF
else
  echo "==> Reusing existing twa-manifest.json (FORCE_MANIFEST=1 to rewrite)"
fi

# androidbrowserhelper 2.7.4 requires API 24, while older Bubblewrap
# projects default to 21. Raise it in existing manifests too.
node - <<'NODE'
const fs = require('fs')
const path = 'twa-manifest.json'
const data = JSON.parse(fs.readFileSync(path, 'utf8'))

if (!data.minSdkVersion || data.minSdkVersion < 24) {
  data.minSdkVersion = 24
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
  console.log('==> minSdkVersion raised to 24')
}
NODE

# ---------------------------------------------------------------------------
# 4. Generate the Android project and build the APK
# ---------------------------------------------------------------------------

echo "==> Generating Android project"
if ! "${BUBBLEWRAP[@]}" update --skipVersionUpgrade; then
  echo "" >&2
  echo "Bubblewrap could not generate the project." >&2
  echo "Run 'npx @bubblewrap/cli doctor' and configure the JDK/Android SDK if needed." >&2
  exit 1
fi

export BUBBLEWRAP_KEYSTORE_PASSWORD="$KEYSTORE_PASSWORD"
export BUBBLEWRAP_KEY_PASSWORD="$KEY_PASSWORD"

echo "==> Building signed APK"
"${BUBBLEWRAP[@]}" build --skipPwaValidation

# ---------------------------------------------------------------------------
# 5. Copy artifacts
# ---------------------------------------------------------------------------

APK_SOURCE="app-release-signed.apk"
APK_TARGET="../dist/airdrome-${VERSION}.apk"

if [ ! -f "$APK_SOURCE" ]; then
  echo "Expected APK not found: $TWA_DIR/$APK_SOURCE" >&2
  exit 1
fi

mkdir -p ../dist
cp "$APK_SOURCE" "$APK_TARGET"
echo "==> Signed APK: dist/airdrome-${VERSION}.apk"

# Only the signed APK is published by default. Set BUILD_AAB=1 to also
# copy the Play Store bundle.
if [ "${BUILD_AAB:-0}" = "1" ] && [ -f app-release-bundle.aab ]; then
  cp app-release-bundle.aab "../dist/airdrome-${VERSION}.aab"
  echo "==> AAB: dist/airdrome-${VERSION}.aab"
else
  rm -f "../dist/airdrome-${VERSION}.aab"
fi

# ---------------------------------------------------------------------------
# 6. Digital Asset Links
# ---------------------------------------------------------------------------

if "${BUBBLEWRAP[@]}" fingerprint generateAssetLinks --output=assetlinks.json; then
  echo "==> Asset links: $TWA_DIR/assetlinks.json"
  echo "    Host it at: https://$HOST/.well-known/assetlinks.json"
fi
