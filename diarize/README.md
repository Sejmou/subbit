# Subtitle generation (incl. diarization) through whisperx

Turn a local video into Subbit-ready whisperx JSON: word-level timing plus
speaker labels from diarization.

## Prerequisites

- **ffmpeg** — extract audio from the video container
- **uv** — Python env and dependency manager ([install](https://docs.astral.sh/uv/))
- **GPU (recommended)** — NVIDIA with CUDA on Linux/Windows; CPU works but is much slower
- **Hugging Face token** — required for diarization (pyannote models are gated)

Install Python dependencies once:

```bash
cd diarize
uv sync
```

### Hugging Face setup (diarization)

1. Create an account at [huggingface.co](https://huggingface.co/join).
2. Create a **read** access token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
3. Accept the user conditions for the diarization models whisperx uses (search for **pyannote** on Hugging Face and open each model page linked from the whisperx docs if loading fails).

Store the token in `diarize/.env` (copy from [`.env.example`](.env.example)):

```bash
cp diarize/.env.example diarize/.env
# edit diarize/.env → HF_TOKEN=hf_…
```

You can also `export HF_TOKEN=hf_…` or pass `--hf-token` for a one-off run. A
value already in the environment or on the command line overrides `.env`.

## Quick start

From the repo root:

```bash
./diarize/transcribe.sh path/to/video.mp4
```

This writes `path/to/video.json` next to the video.

Custom output path (common layout for a single show in `data/`):

```bash
./diarize/transcribe.sh video.mp4 ./data/audio.json
```

## What the script does

1. **ffmpeg** extracts mono 16 kHz WAV (what whisperx expects).
2. **whisperx** transcribes, aligns words, and (by default) diarizes speakers.
3. The JSON is moved to your chosen output path (default: same basename as the video).

Equivalent manual steps:

```bash
ffmpeg -i video.mp4 -vn -ar 16000 -ac 1 audio.wav

uv run whisperx audio.wav \
  --model large-v3 \
  --language de \
  --device cuda \
  --compute_type float16 \
  --batch_size 16 \
  --diarize \
  --hf_token "$HF_TOKEN" \
  --output_dir ./data \
  --output_format json
# → ./data/audio.json
```

## Options

```bash
./diarize/transcribe.sh video.mp4 [output.json] [options]

  --language CODE       default: de
  --model NAME          default: large-v3
  --device auto|cuda|cpu
  --compute-type TYPE   float16 | float32 | int8 | auto (auto: float16 on GPU, int8 on CPU)
  --batch-size N        default: 16
  --no-diarize          transcription + alignment only
  --hf-token TOKEN      or HF_TOKEN in the environment / diarize/.env
  --keep-wav            also write <output-basename>.wav beside the JSON
```

Examples:

```bash
# English, explicit GPU settings
HF_TOKEN=hf_… ./diarize/transcribe.sh clip.mp4 --language en --device cuda

# CPU-only machine (slow)
HF_TOKEN=hf_… ./diarize/transcribe.sh clip.mp4 --device cpu --batch-size 4

# Transcription without speaker labels
./diarize/transcribe.sh clip.mp4 --no-diarize
```

## Using the JSON in Subbit

1. Open Subbit and choose your `.mp4`.
2. In the setup dialog, click **Create a new project** (optionally set a project name).
3. Click **Start from a whisperx audio transcript** and pick the JSON file from this
   pipeline (filename does not matter — Subbit validates the `segments` array).
4. Optionally load waveform peaks via **Subbit → Advanced… → Import waveform
   data…** (see [`../waveform/README.md`](../waveform/README.md)).

To resume later, use **Import an existing project** in the setup dialog (or
**Subbit → Import project bundle…**) with a saved `.subbit.zip`.
