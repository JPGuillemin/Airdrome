#!/usr/bin/env bash
#
# Synchronize the Airdrome working tree with the build/commit server.
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

  # Local tooling / generated output.
  --exclude='/.git/'
  --exclude='/node_modules/'
  --exclude='/dist/'
  --exclude='/android-twa/'
  --exclude='/.gradle/'
  --exclude='/build/'
  --exclude='/docker/'
  --exclude='/stats.html'
  --exclude='/txt'
  --exclude='/.archive/'

  # Local secrets and environment.
  --exclude='/.env*'
  --exclude='*.apk'
  --exclude='*.aab'
  --exclude='*.keystore'
  --exclude='*.jks'

  # Editor / OS noise.
  --exclude='.DS_Store'
  --exclude='/.idea/'
  --exclude='/.vscode/'
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
