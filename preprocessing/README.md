# Local preprocessing for Subbit

Turn a local video into Subbit-ready assets: whisperx JSON with word-level timing
and speaker labels (required), plus optional timeline waveform peaks.

## Prerequisites

- **ffmpeg** — used by both scripts
- **uv** — Python env for whisperx ([install](https://docs.astral.sh/uv/))
- **GPU (recommended)** — NVIDIA with CUDA on Linux/Windows; CPU works but is much slower
- **Hugging Face token** — required for diarization (pyannote models are gated)
- **audiowaveform** — optional; for timeline waveform peaks ([install](https://github.com/bbc/audiowaveform); macOS: `brew install audiowaveform`)

Install Python dependencies once:

```bash
cd preprocessing
uv sync
```

### Hugging Face setup (diarization)

1. Create an account at [huggingface.co](https://huggingface.co/join).
2. Create a **read** access token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
3. Accept the user conditions for the diarization models whisperx uses (search for **pyannote** on Hugging Face and open each model page linked from the whisperx docs if loading fails).

Store the token in `preprocessing/.env` (copy from [`.env.example`](.env.example)):

```bash
cp preprocessing/.env.example preprocessing/.env
# edit preprocessing/.env → HF_TOKEN=hf_…
```

You can also `export HF_TOKEN=hf_…` or pass `--hf-token` for a one-off run. A
value already in the environment or on the command line overrides `.env`.

## Suggested layout

```bash
./preprocessing/transcribe.sh video.mp4 ./data/audio.json
./preprocessing/waveform.sh video.mp4 ./data/video-waveforms.dat
```

```
data/
  video.mp4
  audio.json             ← whisperx output (required for new projects)
  video-waveforms.dat    ← optional timeline peaks (binary, preferred)
  video.waveform.json    ← optional JSON variant
  My Show.subbit.json    ← saved Subbit project
```

## Transcription (`transcribe.sh`)

From the repo root:

```bash
./preprocessing/transcribe.sh path/to/video.mp4
```

Writes `path/to/video.json` next to the video.

Custom output path:

```bash
./preprocessing/transcribe.sh video.mp4 ./data/audio.json
```

### What it does

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

### Options

```bash
./preprocessing/transcribe.sh video.mp4 [output.json] [options]

  --language CODE       default: de
  --model NAME          default: large-v3
  --device auto|cuda|cpu
  --compute-type TYPE   float16 | float32 | int8 | auto (auto: float16 on GPU, int8 on CPU)
  --batch-size N        default: 16
  --no-diarize          transcription + alignment only
  --hf-token TOKEN      or HF_TOKEN in the environment / preprocessing/.env
  --keep-wav            also write <output-basename>.wav beside the JSON
```

Examples:

```bash
# English, explicit GPU settings
HF_TOKEN=hf_… ./preprocessing/transcribe.sh clip.mp4 --language en --device cuda

# CPU-only machine (slow)
HF_TOKEN=hf_… ./preprocessing/transcribe.sh clip.mp4 --device cpu --batch-size 4

# Transcription without speaker labels
./preprocessing/transcribe.sh clip.mp4 --no-diarize
```

## Waveform peaks (`waveform.sh`, optional)

Pre-compute compact peak data for the Subbit timeline ([peaks.js](https://github.com/bbc/peaks.js)). The browser cannot generate this efficiently; use [audiowaveform](https://github.com/bbc/audiowaveform) locally instead.

From the repo root:

```bash
./preprocessing/waveform.sh path/to/video.mp4
```

Writes `path/to/video-waveforms.dat` next to the video (mono 44.1 kHz, 8-bit, 80 px/s).

Options:

```bash
# Custom output path
./preprocessing/waveform.sh video.mp4 ./data/video-waveforms.dat

# JSON instead of binary (larger, easier to inspect; Subbit accepts both)
./preprocessing/waveform.sh video.mp4 ./data/video.waveform.json --json

# Adjust max zoom / file size (default: 80)
./preprocessing/waveform.sh video.mp4 --pixels-per-second 100
```

The script extracts audio with ffmpeg to a temporary WAV, then runs `audiowaveform -b 8 --pixels-per-second …`. For `--pixels-per-second` trade-offs and copy-paste commands tailored to your video, use **Subbit → Advanced… → Import waveform data…** in the app — that dialog includes a calculator and import step.

## Using assets in Subbit

1. Open Subbit and choose your `.mp4`.
2. In the setup dialog, click **Create a new project** (optionally set a project name).
3. Click **Start from a whisperx audio transcript** and pick the JSON from `transcribe.sh` (filename does not matter — Subbit validates the `segments` array).
4. Optionally **Subbit → Advanced… → Import waveform data…** and pick the `.dat` or `.json` from `waveform.sh`. The app validates duration against the loaded video and stores peaks with the project in your browser. To change max zoom later, regenerate with a new `--pixels-per-second`, then **Replace waveform data…**.

To resume later, use **Import an existing project** in the setup dialog (or
**Subbit → Import project bundle…**) with a saved `.subbit.zip`.
