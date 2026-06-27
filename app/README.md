# Subbit

A zero-install, browser-based subtitle editor for editing subtitles of a local
video while capturing two extra pieces of metadata per line:

1. **Rolle** - who speaks (mapped from whisperx diarization labels to real names)
2. **Info** - the shot type (`ON` / `OFF` / `CONTRE`), including shot changes
   that occur mid-subtitle

It imports the rich whisperx `audio.json` (word-level timing + speakers), lets
you fix text/timing fast with the keyboard, and exports a broadcast-style CSV.

## Why a web app

- **Nothing to install** for non-technical users: open the hosted URL in
  Chrome or Edge (Windows included).
- **Large videos are fine**: the `<video>` element streams the local file from
  disk via an object URL, so multi-GB files play without loading into memory.
  Nothing is ever uploaded.
- The same codebase can later be wrapped in Tauri for a native build.

## Requirements for the video

The browser plays the file directly, so it must be **H.264 video + AAC audio**
in an mp4 (the common case). If a file won't play, remux/transcode once:

```bash
ffmpeg -i input.mkv -c:v libx264 -c:a aac -movflags +faststart output.mp4
```

## Develop

```bash
pnpm install
pnpm dev        # start the dev server
pnpm test       # run unit tests (timecode conversion)
pnpm build      # production build into dist/
```

## Using it

1. **Video**: choose the `.mp4`.
2. **Subtitles**: "New from whisperx JSON" (the `audio.json` from whisperx) for a
   fresh project, or "Open project" to resume a saved `.subbit.json`.
3. Edit. **Save project** writes a `.subbit.json` (your editable source of
   truth). **Export delivery** writes the CSV/TSV; **Export .srt** writes plain
   SRT for other tools.

On Chrome/Edge the app remembers the file handles, so "Reopen last session"
restores the video + project without re-picking the 1+ GB file, and the project
autosaves in place.

### Data model

- A **cue** = one row in the delivery CSV.
- A cue holds an ordered list of **segments** `{ text, shot }`. A single segment
  is a normal subtitle; multiple segments represent a shot change inside one
  subtitle and export by joining text and shot tokens with `" / "`
  (e.g. `Info = "CONTRE / ON"`).
- The project keeps whisperx word-level timing so cues can be split/merged
  losslessly.

### Speaker inference (whisperx import)

WhisperX assigns a diarization label to each segment and (when available) to
each word. Those labels come from overlap between ASR segments and a separate
diarization pass — they are not a calibrated probability. The per-word `score`
field is alignment confidence (how well the word fits the audio), not speaker
confidence, so Subbit ignores it for role assignment.

On import, Subbit picks a speaker using **duration-weighted plurality**: for
each labeled word, add `(end − start)` to that speaker's tally; the winner's
share of total labeled time becomes `inferredSpeaker.confidence`. Example: if
speaker A holds 3s and B holds 1s, A wins with confidence 0.75.

- **`inferredSpeaker`** is stored on every cue where inference is possible
  (`{ speakerId, confidence }`). It is a snapshot from import and is kept even
  after you assign a role manually.
- **`speakerId`** is set automatically only when confidence ≥ **0.75**. Below
  that threshold the cue is left unassigned (`— Role —`); pick one with `A`.
- If words lack speaker labels, Subbit falls back to the segment-level
  `speaker` with confidence 1.

The 0.75 cutoff avoids auto-assigning ambiguous cues (e.g. two speakers with
similar talk time) while still filling in clear single-speaker lines. After
timing edits, word arrays can drift from cue boundaries; inference is
intentionally frozen at import — assign roles manually where the field is empty.

### Delivery format

Columns: `No, Timecode In, Timecode Out, Rolle, Info, Subtitle`.
Timecodes are SMPTE `HH:MM:SS:FF` at the project's fps (25) with a configurable
start offset (default `10:00:00:00`). Default delimiter is tab; comma-CSV is
also available (fields are quoted per RFC 4180).

Press **`?`** in the app anytime for the full keyboard shortcut list.
