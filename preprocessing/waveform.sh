#!/usr/bin/env bash
# Generate audiowaveform peak data (.dat or .json) from a video file for peaks.js.
#
# Usage:
#   ./preprocessing/waveform.sh <video.mp4> [output] [--json] [--pixels-per-second N]
#
# Examples:
#   ./preprocessing/waveform.sh video.mp4
#   ./preprocessing/waveform.sh video.mp4 ./data/video-waveforms.dat
#   ./preprocessing/waveform.sh video.mp4 ./data/video.waveform.json --json

set -euo pipefail

PIXELS_PER_SECOND=80
FORMAT=dat

usage() {
  sed -n '2,6p' "$0" >&2
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: '$1' not found in PATH" >&2
    case "$1" in
      ffmpeg) echo "Install ffmpeg: https://ffmpeg.org/download.html" >&2 ;;
      audiowaveform)
        echo "Install audiowaveform: brew install audiowaveform (macOS) or see https://github.com/bbc/audiowaveform" >&2
        ;;
    esac
    exit 1
  fi
}

if [[ $# -lt 1 ]]; then
  usage
fi

INPUT="$1"
shift

if [[ ! -f "$INPUT" ]]; then
  echo "error: input file not found: $INPUT" >&2
  exit 1
fi

OUTPUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)
      FORMAT=json
      shift
      ;;
    --pixels-per-second)
      PIXELS_PER_SECOND="${2:?--pixels-per-second requires a number}"
      shift 2
      ;;
    --help|-h)
      usage
      ;;
    -*)
      echo "error: unknown option: $1" >&2
      usage
      ;;
    *)
      if [[ -n "$OUTPUT" ]]; then
        echo "error: unexpected argument: $1" >&2
        usage
      fi
      OUTPUT="$1"
      shift
      ;;
  esac
done

BASE="${INPUT%.*}"
if [[ -z "$OUTPUT" ]]; then
  if [[ "$FORMAT" == json ]]; then
    OUTPUT="${BASE}.waveform.json"
  else
    OUTPUT="${BASE}-waveforms.dat"
  fi
fi

require_cmd ffmpeg
require_cmd audiowaveform

TMP_WAV="$(mktemp "${TMPDIR:-/tmp}/subbit-waveform.XXXXXX.wav")"
cleanup() { rm -f "$TMP_WAV"; }
trap cleanup EXIT

echo "Extracting audio from $(basename "$INPUT") …"
ffmpeg -hide_banner -loglevel error -i "$INPUT" -vn -ac 1 -ar 44100 -y "$TMP_WAV"

echo "Generating peaks ($FORMAT, ${PIXELS_PER_SECOND}px/s) → $OUTPUT"
if [[ "$FORMAT" == json ]]; then
  audiowaveform -i "$TMP_WAV" -o "$OUTPUT" -b 8 --pixels-per-second "$PIXELS_PER_SECOND"
else
  audiowaveform -i "$TMP_WAV" -o "$OUTPUT" -b 8 --pixels-per-second "$PIXELS_PER_SECOND"
fi

BYTES="$(wc -c < "$OUTPUT" | tr -d ' ')"
echo "Done. Wrote $OUTPUT ($BYTES bytes)"
