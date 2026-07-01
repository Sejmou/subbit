# Subbit

Browser-based subtitle editor for a **local video**. Each line can carry extra
metadata beyond text and timing — especially **who speaks** and the **type of shot** —
and the project keeps word-level alignment from WhisperX audio transcriptions so cues
can be split and retimed without losing sync.

Nothing is uploaded: the video streams from disk via an object URL, and projects
live in the browser until you export them.

## Why a web app

- **No install** for editors — open the hosted URL in a modern browser
  (Chrome or Edge recommended on Windows).
- **Large files are fine** — playback reads from disk; multi-GB sources are OK.
- **Same codebase** can later be wrapped in Tauri for a native build.

## Video format

The browser must be able to decode the file. **H.264 + AAC in MP4** is the
usual case. If playback fails, remux or transcode once:

```bash
ffmpeg -i input.mkv -c:v libx264 -c:a aac -movflags +faststart output.mp4
```

WhisperX preprocessing (transcription, diarization, optional waveform peaks) is
documented in [`../preprocessing/README.md`](../preprocessing/README.md).

## Develop

From this directory:

```bash
pnpm install
pnpm dev          # dev server
pnpm test         # unit tests (vitest)
pnpm build        # production build → dist/
pnpm lint         # oxlint
pnpm format       # prettier
pnpm format:check
```

## Using the app

1. **Open a video** on the start screen (or restore a previous session when the
   browser still has the file handle).
2. **Create or open a project** — import WhisperX JSON, start from scratch,
   pick a project stored in this browser, or open a backup (`.subbit.zip`
   containing `project.json` and optional waveform data).
3. **Edit** — keyboard-first cue list, waveform timeline, role and shot fields.
   Press **`?`** anytime for shortcuts and in-app help.
4. **Save & export** — work autosaves to browser storage; use **Back up** for
   a full project copy on disk, or **Export subs** for delivery files (ASS,
   VTT, CSV, …).

Exact menu labels, export formats, and per-format options are shown in the UI
(Export subtitles dialog hints). Prefer those over this README when they differ.

### Persistence

| What                           | Where                                                                |
| ------------------------------ | -------------------------------------------------------------------- |
| Day-to-day editing             | Browser storage (IndexedDB), with autosave                           |
| Share / backup / move machines | **Back up project** — a `.subbit.zip` backup via the menu or toolbar |
| Delivery to downstream tools   | **Export subs** dialog (ASS, WebVTT, SRT, TSV, CSV, …)               |

On Chrome/Edge, cached file handles can reopen the same large video without
re-picking it.

## Source of truth (for contributors)

Behavior and on-disk shapes change; these files stay closer to the code than
this README:

| Topic                                                | Location                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| Domain model (cues, speakers, shots, project fields) | [`src/types.ts`](src/types.ts)                                                   |
| Word list, line breaks, timing, validation           | [`docs/word-model.md`](docs/word-model.md)                                       |
| Word-model implementation                            | [`src/lib/word-model/`](src/lib/word-model/)                                     |
| JSON schema & validation                             | [`src/lib/project-schema.ts`](src/lib/project-schema.ts)                         |
| WhisperX import                                      | [`src/lib/import-whisperx.ts`](src/lib/import-whisperx.ts)                       |
| Speaker inference at import                          | [`src/lib/infer-speaker.ts`](src/lib/infer-speaker.ts)                           |
| Export formats & columns                             | [`src/lib/export-format.ts`](src/lib/export-format.ts) and `src/lib/export-*.ts` |
| Project bundle (zip) layout                          | [`src/lib/project-bundle.ts`](src/lib/project-bundle.ts)                         |
| Subtitle SMPTE timeline & timecode                   | [`docs/timeline-timecode.md`](docs/timeline-timecode.md)                         |
| Keyboard shortcuts                                   | [`src/lib/shortcuts/`](src/lib/shortcuts/) (also **`?`** in the app)             |

When updating behavior, change the code (and tests) first; adjust this README
only if the high-level workflow or developer setup changed.
