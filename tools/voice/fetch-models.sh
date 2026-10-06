#!/usr/bin/env bash
# Fetch the Kokoro v1.0 ONNX model files used by tools/voice (GLOBIT 24 voices).
#
#   tools/voice/fetch-models.sh            # into data/models/ (or $KOKORO_DIR)
#   tools/voice/fetch-models.sh --check    # only verify what is there
#   tools/voice/fetch-models.sh --no-cache # always download, never copy ~/.cache/kokoro
#
# Files come from the kokoro-onnx GitHub release "model-files-v1.0" and are
# verified by size and SHA-256 before they are moved into place (downloads go
# to a .part file and resume with curl -C -). A valid copy already sitting in
# ~/.cache/kokoro (where kokoro-onnx users usually keep it) is copied instead
# of downloaded. data/ is git-ignored, so the 350 MB never reach the repo.
# Env: KOKORO_DIR (destination), KOKORO_RELEASE_URL (mirror), ONLY (one file name).
set -euo pipefail

BASE_URL="${KOKORO_RELEASE_URL:-https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
DEST="${KOKORO_DIR:-$REPO/data/models}"
CACHE="${HOME}/.cache/kokoro"

# name size sha256
FILES=(
  "kokoro-v1.0.onnx 325532387 7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5"
  "voices-v1.0.bin 28214398 bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"
)

CHECK_ONLY=0
USE_CACHE=1
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --no-cache) USE_CACHE=0 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

filesize() {
  stat -c %s "$1" 2>/dev/null || stat -f %z "$1"
}

# valid <path> <size> <sha>: size first (cheap), then the hash
valid() {
  [ -f "$1" ] || return 1
  [ "$(filesize "$1")" = "$2" ] || return 1
  [ "$(sha256 "$1")" = "$3" ] || return 1
}

mkdir -p "$DEST"
status=0
for entry in "${FILES[@]}"; do
  read -r name size sum <<<"$entry"
  if [ -n "${ONLY:-}" ] && [ "$ONLY" != "$name" ]; then continue; fi
  target="$DEST/$name"
  if valid "$target" "$size" "$sum"; then
    echo "ok       $target"
    continue
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    echo "MISSING  $target (or wrong size/checksum)" >&2
    status=1
    continue
  fi
  if [ "$USE_CACHE" = 1 ] && [ "$CACHE/$name" != "$target" ] && valid "$CACHE/$name" "$size" "$sum"; then
    cp "$CACHE/$name" "$target.part"
    mv "$target.part" "$target"
    echo "copied   $target (from $CACHE)"
    continue
  fi
  echo "fetching $BASE_URL/$name ($((size / 1048576)) MB)"
  curl -fL --progress-bar --retry 3 --retry-delay 2 -C - -o "$target.part" "$BASE_URL/$name"
  if ! valid "$target.part" "$size" "$sum"; then
    echo "FAILED   $name: size or SHA-256 mismatch (got $(filesize "$target.part") bytes, $(sha256 "$target.part"))" >&2
    rm -f "$target.part"
    status=1
    continue
  fi
  mv "$target.part" "$target"
  echo "ok       $target"
done
exit $status
