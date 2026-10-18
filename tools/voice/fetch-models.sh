#!/usr/bin/env bash
# Fetch the Kokoro v1.0 ONNX model files used by tools/voice (GLOBIT 24 voices).
#
#   tools/voice/fetch-models.sh               # the weights the station uses (VOICE_MODEL, default fp32) + voices
#   tools/voice/fetch-models.sh --model fp16  # the half-precision weights instead (VOICE_MODEL=fp16)
#   tools/voice/fetch-models.sh --model all   # every variant (fp32, fp16, int8) + voices
#   tools/voice/fetch-models.sh --check       # only verify what is there (same --model choice)
#   tools/voice/fetch-models.sh --no-cache    # always download, never copy ~/.cache/kokoro
#
# Files come from the kokoro-onnx GitHub release "model-files-v1.0" and are
# verified by size and SHA-256 before they are moved into place (downloads go
# to a .part file and resume with curl -C -). A valid copy already sitting in
# ~/.cache/kokoro (where kokoro-onnx users usually keep it) is copied instead
# of downloaded. data/ is git-ignored, so the weights never reach the repo.
# Weights: fp32 kokoro-v1.0.onnx (310 MB, the default), fp16 (169 MB, VOICE_MODEL=fp16: half precision with part
# of its convolutions in 8 bits, ~15 % less CPU, measured a little less natural: for the owner's ears), int8 (88 MB,
# VOICE_MODEL=int8: measured slower than fp32 on x86 with onnxruntime 1.30, kept for other machines).
# See docs/roadmap/critique/voices-speed.md.
# Env: KOKORO_DIR (destination), KOKORO_RELEASE_URL (mirror), ONLY (one file name), VOICE_MODEL.
set -euo pipefail

BASE_URL="${KOKORO_RELEASE_URL:-https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
DEST="${KOKORO_DIR:-$REPO/data/models}"
CACHE="${HOME}/.cache/kokoro"

# variant name size sha256 (fp16 and int8 measured from the release download, 18 Oct 2026)
FILES=(
  "fp32 kokoro-v1.0.onnx 325532387 7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5"
  "fp16 kokoro-v1.0.fp16.onnx 177464787 c1610a859f3bdea01107e73e50100685af38fff88f5cd8e5c56df109ec880204"
  "int8 kokoro-v1.0.int8.onnx 92361271 6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb"
  "voices voices-v1.0.bin 28214398 bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"
)

CHECK_ONLY=0
USE_CACHE=1
MODEL="${VOICE_MODEL:-fp32}"
while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK_ONLY=1 ;;
    --no-cache) USE_CACHE=0 ;;
    --model) shift; MODEL="${1:-}" ;;
    --model=*) MODEL="${1#--model=}" ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
MODEL="$(printf '%s' "$MODEL" | tr '[:upper:]' '[:lower:]')"
case "$MODEL" in
  fp32|fp16|int8|all) ;;
  *) echo "unknown model: $MODEL (fp32, fp16, int8 or all)" >&2; exit 2 ;;
esac

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
  read -r variant name size sum <<<"$entry"
  if [ "$variant" != voices ] && [ "$MODEL" != all ] && [ "$MODEL" != "$variant" ]; then continue; fi
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
