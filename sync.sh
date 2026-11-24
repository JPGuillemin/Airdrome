#!/usr/bin/env bash
#
# Synchronize the public Airdrome working tree with the build/commit server.
#
# "Public" means every working-tree file that is safe to publish, including
# dist/, public/, stats.html, txt and .archive/. Local tooling, generated
# native copies, deployment files and signing material are excluded.
#
# Usage:
#   ./sync.sh pull
#   ./sync.sh push
#   DRY_RUN=1 ./sync.sh push
#
# Environment overrides:
#   REMOTE      default: hyperion@nimbus
#   REMOTE_DIR  default: /home/hyperion/Projects/Airdrome
#   LOCAL_DIR   default: directory containing this script
#   DRY_RUN     set to 1 to preview changes
#   PULL_DELETE set to 1 to also delete local files missing on the remote

set -euo pipefail

LOCAL_DIR="${LOCAL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
REMOTE="${REMOTE:-hyperion@nimbus}"
REMOTE_DIR="${REMOTE_DIR:-/home/hyperion/Projects/Airdrome}"

RSYNC_OPTS=(
  -avz
  --human-readable
  --itemize-changes

  # Keep the remote's own repository metadata. Public working-tree files
  # (including dist/, docker/, stats.html, txt and .archive/) are synced.
  --exclude='.git/'

  # Local tooling and generated build caches.
  --exclude='node_modules/'
  --exclude='.gradle/'
  --exclude='build/'
  --exclude='.cache/'
  --exclude='.vite/'

  # Generated native copies: recreated by `npx cap sync`.
  --exclude='android/capacitor-cordova-android-plugins/'
  --exclude='android/app/src/main/assets/public/'
  --exclude='android/app/src/main/assets/capacitor.config.json'
  --exclude='android/app/src/main/assets/capacitor.plugins.json'

  # Local-only native output.
  --exclude='android-twa/'
  --exclude='artifacts/'
  --exclude='docker/'
  --exclude='dist-old-root-owned/'
  --exclude='*-root-owned*/'
  --exclude='root-owned-leftovers/'

  # Local secrets and signing material.
  --exclude='.android-signing.env'
  --exclude='.env*'
  --exclude='local.properties'
  --exclude='*.apk'
  --exclude='*.aab'
  --exclude='*.idsig'
  --exclude='*.keystore'
  --exclude='*.jks'
  --exclude='*.p12'
  --exclude='*.pem'

  # Editor / OS noise.
  --exclude='.DS_Store'
  --exclude='.idea/'
  --exclude='.vscode/'
  --exclude='*.log'
  --exclude='*.tmp'
  --exclude='*.swp'
)

if [ "${DRY_RUN:-0}" = "1" ]; then
  RSYNC_OPTS+=(--dry-run)
  echo "==> DRY RUN"
fi

case "${1:-}" in
  pull)
    PULL_OPTS=("${RSYNC_OPTS[@]}")

    if [ "${PULL_DELETE:-0}" = "1" ]; then
      PULL_OPTS+=(--delete)
    fi

    echo "==> Pulling $REMOTE:$REMOTE_DIR/ -> $LOCAL_DIR/"
    rsync "${PULL_OPTS[@]}" "$REMOTE:$REMOTE_DIR/" "$LOCAL_DIR/"
    ;;
  push)
    echo "==> Pushing $LOCAL_DIR/ -> $REMOTE:$REMOTE_DIR/"
    rsync "${RSYNC_OPTS[@]}" --delete "$LOCAL_DIR/" "$REMOTE:$REMOTE_DIR/"
    ;;
  *)
    echo "Usage: $0 pull|push"
    exit 1
    ;;
esac

echo "==> Done"
