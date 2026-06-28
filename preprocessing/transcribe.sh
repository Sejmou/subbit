#!/usr/bin/env bash
# Transcribe + diarize a video file with whisperx, producing Subbit-ready JSON.
#
# Usage:
#   ./preprocessing/transcribe.sh <video> [output.json] [options]
#
# Examples:
#   ./preprocessing/transcribe.sh video.mp4
#   ./preprocessing/transcribe.sh video.mp4 ./data/audio.json
#   HF_TOKEN=hf_… ./preprocessing/transcribe.sh video.mp4 --language en --device cuda

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

load_env_file() {
  local env_file="$SCRIPT_DIR/.env"
  [[ -f "$env_file" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

MODEL=large-v3
LANGUAGE=de
DEVICE=auto
COMPUTE_TYPE=auto
BATCH_SIZE=16
DIARIZE=1
KEEP_WAV=0
HF_TOKEN="${HF_TOKEN:-}"
if [[ -z "$HF_TOKEN" ]]; then
  load_env_file
fi

usage() {
  sed -n '2,10p' "$0" >&2
  cat >&2 <<'EOF'

Options:
  --language CODE       Spoken language (default: de)
  --model NAME          Whisper model (default: large-v3)
  --device auto|cuda|cpu
  --compute-type TYPE   float16, float32, int8, or auto (default: auto)
  --batch-size N        Inference batch size (default: 16)
  --no-diarize          Skip speaker diarization
  --hf-token TOKEN      Hugging Face token (or HF_TOKEN / preprocessing/.env)
  --keep-wav            Keep extracted mono 16 kHz WAV next to the JSON
  --help, -h            Show this help
EOF
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: '$1' not found in PATH" >&2
    case "$1" in
      ffmpeg) echo "Install ffmpeg: https://ffmpeg.org/download.html" >&2 ;;
      uv) echo "Install uv: https://docs.astral.sh/uv/" >&2 ;;
    esac
    exit 1
  fi
}

detect_device() {
  if [[ "$DEVICE" != auto ]]; then
    echo "$DEVICE"
    return
  fi
  if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
    echo cuda
    return
  fi
  echo cpu
}

resolve_compute_type() {
  local resolved_device="$1"
  if [[ "$COMPUTE_TYPE" != auto ]]; then
    echo "$COMPUTE_TYPE"
    return
  fi
  if [[ "$resolved_device" == cuda ]]; then
    echo float16
  else
    echo int8
  fi
}

if [[ $# -lt 1 ]]; then
  usage
fi

# Allow --help without a video path.
if [[ "$1" == --help || "$1" == -h ]]; then
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
    --language)
      LANGUAGE="${2:?--language requires a code}"
      shift 2
      ;;
    --model)
      MODEL="${2:?--model requires a name}"
      shift 2
      ;;
    --device)
      DEVICE="${2:?--device requires auto, cuda, or cpu}"
      shift 2
      ;;
    --compute-type)
      COMPUTE_TYPE="${2:?--compute-type requires a value}"
      shift 2
      ;;
    --batch-size)
      BATCH_SIZE="${2:?--batch-size requires a number}"
      shift 2
      ;;
    --no-diarize)
      DIARIZE=0
      shift
      ;;
    --hf-token)
      HF_TOKEN="${2:?--hf-token requires a value}"
      shift 2
      ;;
    --keep-wav)
      KEEP_WAV=1
      shift
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

INPUT_ABS="$(cd "$(dirname "$INPUT")" && pwd)/$(basename "$INPUT")"
BASE="${INPUT_ABS%.*}"
BASENAME="$(basename "$BASE")"

if [[ -z "$OUTPUT" ]]; then
  OUTPUT="${BASE}.json"
else
  OUTPUT="$(cd "$(dirname "$OUTPUT")" 2>/dev/null && pwd)/$(basename "$OUTPUT")" || OUTPUT="$(pwd)/$(basename "$OUTPUT")"
fi

RESOLVED_DEVICE="$(detect_device)"
RESOLVED_COMPUTE_TYPE="$(resolve_compute_type "$RESOLVED_DEVICE")"

require_cmd ffmpeg
require_cmd uv

if [[ "$DIARIZE" -eq 1 && -z "$HF_TOKEN" ]]; then
  echo "error: diarization requires a Hugging Face token." >&2
  echo "Create one at https://huggingface.co/settings/tokens (read access)," >&2
  echo "accept the pyannote model terms, then run:" >&2
  echo "  put HF_TOKEN=hf_… in preprocessing/.env," >&2
  echo "  export HF_TOKEN=hf_…, or pass --hf-token hf_…" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/subbit-preprocessing.XXXXXX")"
WAV_PATH="$WORK_DIR/${BASENAME}.wav"
WHISPERX_JSON="$WORK_DIR/${BASENAME}.json"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "Extracting mono 16 kHz audio from $(basename "$INPUT_ABS") …"
ffmpeg -hide_banner -loglevel error -i "$INPUT_ABS" -vn -ac 1 -ar 16000 -y "$WAV_PATH"

WHISPERX_ARGS=(
  "$WAV_PATH"
  --model "$MODEL"
  --language "$LANGUAGE"
  --device "$RESOLVED_DEVICE"
  --compute_type "$RESOLVED_COMPUTE_TYPE"
  --batch_size "$BATCH_SIZE"
  --output_dir "$WORK_DIR"
  --output_format json
  --print_progress True
)

if [[ "$DIARIZE" -eq 1 ]]; then
  WHISPERX_ARGS+=(--diarize --hf_token "$HF_TOKEN")
fi

echo "Running whisperx ($MODEL, $LANGUAGE, $RESOLVED_DEVICE, $RESOLVED_COMPUTE_TYPE) …"
(
  cd "$SCRIPT_DIR"
  uv run whisperx "${WHISPERX_ARGS[@]}"
)

if [[ ! -f "$WHISPERX_JSON" ]]; then
  echo "error: whisperx did not produce $WHISPERX_JSON" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
mv "$WHISPERX_JSON" "$OUTPUT"

if [[ "$KEEP_WAV" -eq 1 ]]; then
  WAV_OUT="${OUTPUT%.*}.wav"
  cp "$WAV_PATH" "$WAV_OUT"
  echo "Kept extracted audio → $WAV_OUT"
fi

BYTES="$(wc -c < "$OUTPUT" | tr -d ' ')"
echo "Done. Wrote $OUTPUT ($BYTES bytes)"
