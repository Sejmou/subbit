# Waveform peak generation

Pre-compute compact waveform data for [peaks.js](https://github.com/bbc/peaks.js) from a local video file. Peaks.js expects a small sidecar file from [audiowaveform](https://github.com/bbc/audiowaveform), not raw MP4 audio.

## Prerequisites

- **ffmpeg** — extract audio from MP4 (same as the `diarize/` pipeline)
- **audiowaveform** — write `.dat` (binary) or `.json` peaks

```bash
# macOS
brew install audiowaveform

# Linux — build from source or use your distro package; see audiowaveform README
```

## Quick start

From the repo root:

```bash
./waveform/generate.sh path/to/video.mp4
```

Writes `path/to/video-waveforms.dat` next to the video (mono 44.1 kHz, 8-bit, 80 px/s).

Options:

```bash
# Custom output path
./waveform/generate.sh video.mp4 ./data/video-waveforms.dat

# JSON instead of binary (larger, easier to inspect; Subbit accepts both)
./waveform/generate.sh video.mp4 ./data/video.waveform.json --json

# Adjust max zoom / file size (default: 80)
./waveform/generate.sh video.mp4 --pixels-per-second 100
```

The script extracts audio with ffmpeg to a temporary WAV, then runs `audiowaveform -b 8 --pixels-per-second …`. For `--pixels-per-second` trade-offs and copy-paste commands tailored to your video, use **Subbit → Advanced… → Import waveform data…** in the app — that dialog includes a calculator and import step.

## Pipeline layout

Generate peaks alongside whisperx output:

```bash
./waveform/generate.sh video.mp4 ./data/video-waveforms.dat
HF_TOKEN=hf_… ./diarize/transcribe.sh video.mp4 ./data/audio.json
```

Suggested `data/` layout:

```
data/
  video.mp4
  video-waveforms.dat    ← waveform peaks (binary, preferred)
  video.waveform.json    ← optional JSON variant
  audio.json             ← whisperx output
  My Show.subbit.json    ← saved Subbit project
```

## Using peaks in Subbit

1. Open the video and project as usual (see [`diarize/README.md`](../diarize/README.md) for the whisperx import flow).
2. **Subbit → Advanced… → Import waveform data…** and pick the `.dat` or `.json` file. The app validates duration against the loaded video and stores peaks with the project in your browser.
3. To change max zoom later, pick a new `--pixels-per-second`, regenerate, then **Replace waveform data…** (also in Advanced).
