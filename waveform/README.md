# Waveform peak generation

Pre-compute compact waveform data for [peaks.js](https://github.com/bbc/peaks.js) from a local video file.

Peaks.js does **not** read raw MP4 audio efficiently for long files. Instead it expects a small sidecar file produced by [audiowaveform](https://github.com/bbc/audiowaveform) — the same tool BBC uses for broadcast waveforms.

## Prerequisites

- **ffmpeg** — extract audio from MP4 (already used by the `diarize/` pipeline)
- **audiowaveform** — generate peaks in `.dat` (binary) or `.json` format

Install audiowaveform:

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

This writes `path/to/video-waveforms.dat` next to the video.

Options:

```bash
# Custom output path
./waveform/generate.sh video.mp4 ./data/video-waveforms.dat

# JSON instead of binary (larger, easier to inspect; peaks.js accepts both)
./waveform/generate.sh video.mp4 ./data/video.waveform.json --json

# Lower resolution (smaller file)
./waveform/generate.sh video.mp4 --pixels-per-second 20

# More detail in the waveform (larger file)
./waveform/generate.sh video.mp4 --pixels-per-second 100
```

## What the script does

1. **ffmpeg** demuxes audio from the MP4 to mono 44.1 kHz WAV (piped, no temp file on disk).
2. **audiowaveform** reads that WAV and writes min/max peak pairs.

Equivalent manual commands:

```bash
ffmpeg -i video.mp4 -vn -ac 1 -ar 44100 -f wav -  \
  | audiowaveform -i - -o video-waveforms.dat -b 8 --pixels-per-second 80
```

### Why not ffmpeg alone?

ffmpeg can render a PNG waveform image, but peaks.js needs **structured peak data** (min/max pairs over time at multiple zoom levels). That is what audiowaveform produces. ffmpeg is only used here to get a clean audio stream out of the container.

### Recommended settings for Subbit

| Option | Value | Reason |
|--------|-------|--------|
| `-b 8` | 8-bit peaks | Required by peaks.js; keeps files small |
| `--pixels-per-second 80` | 80 peaks/sec | Default — ~10 s max zoom, ~880 KB for 90 min |
| `-ac 1` (ffmpeg) | mono | Peaks.js overview uses a single channel |

## Using peaks in the app

1. Generate peaks alongside your whisperx run:

   ```bash
   ./waveform/generate.sh video.mp4 ./data/video-waveforms.dat
   uv run whisperx ./data/audio.wav ...   # existing diarize flow
   ```

2. In Subbit, open the video and project as usual.

3. **Subbit → Advanced… → Import waveform data…** and pick the `.dat` or `.json` file.

   The app validates the file, checks duration against the loaded video, and caches peaks in IndexedDB keyed by video identity so you only import once per video.

4. When the timeline UI is wired up, peaks.js receives the cached data as:

   ```js
   Peaks.init({
     // ...
     waveformData: {
       arraybuffer: cachedArrayBuffer, // .dat
       // or json: parsedObject          // .json
     },
   })
   ```

## File naming convention

Place peaks next to other pipeline artifacts:

```
data/
  video.mp4
  video-waveforms.dat    ← waveform peaks (binary, preferred)
  video.waveform.json    ← optional JSON variant
  audio.json             ← whisperx output
  My Show.subbit.json    ← saved Subbit project
```

## File size reference

Approximate `.dat` size ≈ `duration_seconds × pixels_per_second × 2 bytes` (8-bit mono).

| Duration | 20 px/sec | 80 px/sec (default) | 100 px/sec |
|----------|-----------|---------------------|------------|
| 90 min   | ~220 KB   | ~880 KB             | ~1.1 MB    |
| 120 min  | ~290 KB   | ~1.2 MB             | ~1.4 MB    |

## Zoom depth vs `--pixels-per-second`

Max zoom-in is limited by the peaks file: you cannot magnify past its native
resolution. Roughly, the narrowest time window you can fill the timeline with
(at ~800 px wide, 44.1 kHz audio) is:

| `--pixels-per-second` | ~Min visible span |
|----------------------|-------------------|
| 20                   | ~40 s             |
| 40                   | ~20 s             |
| 80 (default)         | ~10 s             |
| 100                  | ~8 s              |

After changing `--pixels-per-second`, regenerate and re-import:

```bash
./waveform/generate.sh video.mp4 ./data/video-waveforms.dat --pixels-per-second 80
```

Then **Subbit → Advanced… → Replace waveform data…** (or delete the IndexedDB cache by
changing videos / clearing site data).
