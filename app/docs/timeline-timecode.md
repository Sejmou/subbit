# Timeline & timecode redesign

Design reference for unifying the editor around **subtitle SMPTE time** — one
timeline, no File/Program toggle — with frame-accurate editing and project-scoped
configuration.

Status: **planned** (not yet implemented).

---

## Mental model

Users work in **subtitle time** everywhere. The waveform and `<video>` element
still operate on **file time** (seconds from the start of the media file); only
labels and editable fields use SMPTE.

```text
subtitleTC = startTimecode + (mediaFrame − referenceFrame)   // SMPTE, nominal fps
fileSeconds = mediaFrame × fpsDenominator / fpsNumerator     // for playback & Peaks
```

| Concept               | Project field (current → target)                       | Meaning                                                              |
| --------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| **Start timecode**    | `timecodeOffset` → keep name or rename `startTimecode` | SMPTE at the reference frame (`00:00:00:00` EU, `01:00:00:00` US, …) |
| **Reference frame**   | `contentStartSeconds` → `referenceFrame` (integer)     | First frame of subtitle timing (skips leader/black)                  |
| **Media frame rate**  | `fps` (number) → `fpsNumerator` / `fpsDenominator`     | Exact container rate (e.g. `24000/1001`)                             |
| **Nominal SMPTE fps** | (new, derived)                                         | Integer for `:FF` field — `24`, `25`, `30`                           |
| **Cue position**      | `start` / `end` (seconds) → `startFrame` / `endFrame`  | Integer frame index from file start                                  |

### Removed

- **`timeReference`** (`file` \| `program`) — was a **localStorage UI toggle**, not
  stored in the project. It switched playhead/cue display between file time and
  program time. Replaced by a single subtitle timeline derived from project
  settings.

---

## Why two “fps” values?

Non-integer rates (23.976p, 29.97i) need **two** numbers:

|                                               | Purpose                                     | Example                 |
| --------------------------------------------- | ------------------------------------------- | ----------------------- |
| **Actual rate** `fpsNumerator/fpsDenominator` | Frame boundaries, seek math, video identity | `24000/1001`            |
| **Nominal SMPTE fps**                         | `:FF` counter range (always integer)        | `24` (frames `00`–`23`) |

`VideoIdentity` already stores the rational rate for probing and re-link checks.
That is **not** cue storage — it answers “what kind of video is this?” Cue frames
still need that rate to convert `frameIndex → fileSeconds` for `video.currentTime`.

Integer rates (25 fps PAL, 24 fps exact) are the simple case where both values
agree.

---

## Display & edit pipeline

1. **Storage:** cue `startFrame` / `endFrame` (integers from file start).
2. **Display:** frame → subtitle SMPTE via start timecode, reference frame,
   nominal fps.
3. **Edit (type TC, set In/Out, nudge):** parse SMPTE → frame index → store;
   seek to `frame × den / num`.
4. **Playback while playing:** `video.currentTime` stays continuous; **shown**
   playhead rounds to nearest frame’s SMPTE (standard NLE behaviour).
5. **Peaks timeline:** scroll/zoom stays in file seconds; **axis labels, playhead
   label, marker tooltip, view-range text** use subtitle SMPTE formatters.
6. **Export:** same formula as the UI (no separate “broadcast offset” step in
   the export dialog).

### WhisperX import

WhisperX timings are **file-relative float seconds** (audio-aligned, often
sub-frame). On import:

- Convert each boundary: `frame = round(seconds × num / den)`.
- Store `startFrame` / `endFrame`.
- Word-level `start`/`end` can stay as seconds until edited, or snap on import
  (decide in implementation; document chosen behaviour in this file).

No reference frame or start timecode in the import file — new projects default
to reference frame `0` and start timecode `00:00:00:00`.

---

## Defaults for new projects

| Field                              | Default                   | Set when           |
| ---------------------------------- | ------------------------- | ------------------ |
| `startTimecode` (`timecodeOffset`) | `00:00:00:00`             | Project creation   |
| `referenceFrame`                   | `0`                       | Project creation   |
| `fpsNumerator` / `fpsDenominator`  | `25/1`                    | Until video linked |
| Nominal SMPTE fps                  | `round(num/den)`          | Derived            |
| Cues                               | `startFrame` / `endFrame` | Import or manual   |

When a video is linked, copy probed `frameRateNumerator/Denominator` from
`VideoIdentity` onto the project (option 2 from design discussion). Fallback
`25/1` if probe fails.

---

## Caveats & non-goals (v1)

### Non-drop-frame only

SMPTE helpers are **non-drop-frame (NDF)**. The `:FF` field uses nominal integer
fps (`24` for 23.976p, `30` for 29.97i).

- **23.976p:** NDF 24fps labelling drifts from wall-clock time over very long
  durations (~3.6 s/hour). Normal for subtitle work; delivery rarely expects
  drop-frame unless specified.
- **29.97i NTSC:** US broadcast sometimes requires **drop-frame** timecode
  (`01:00:00;00`, skipped frame numbers). **Not in v1.** Add later as a project
  flag with `;` parsing/formatting if needed.

### HTML video seek precision

The browser seeks in **seconds**, not discrete frames. Quantizing to
`frameIndex × den / num` lands on the nearest decodable sample; frame-accurate
**editing** is supported, sample-perfect **playback** is not guaranteed on all
codecs/browsers.

### Peaks.js axis

Timeline geometry remains file-time-based. Subtitle SMPTE on the ruler requires
custom formatters (axis ticks, playhead label, program-start marker via
`layer.formatTime`). Expect Peaks integration work, not just CSS.

### Legacy projects

- Existing `project.json` uses seconds for cues and `timecodeOffset` default
  `10:00:00:00`. Migration on load: convert `start`/`end` → frames; optionally
  leave `10:00:00:00` unchanged for old projects (user’s saved intent).
- Bump `PROJECT_VERSION` when schema changes.

### `timeReference` localStorage

Delete `subbit:timeReference` usage. No migration needed — it was display-only.

### Export formats

- **SRT/VTT/ASS:** subtitle time from `(frame − ref) + startTC`; typically no
  delivery offset beyond start timecode.
- **Delivery CSV:** same SMPTE formula; `startTimecode` replaces the old
  export-only “broadcast offset” field.

### fps before video is linked

Project keeps `25/1` until a video is linked and probed. UI should indicate
when frame rate is provisional.

---

## UI direction (Flow A)

Toolbar (replaces `ProgramStartPanel` + File/Program dropdown):

```text
Timeline │ Start TC [00:00:00:00 ▾] │ Ref frame [00:00:00:00] [Set] [Clear] │ Playhead [00:05:22:12]
```

- **Start TC:** presets EU (`00:00:00:00`), US (`01:00:00:00`), custom; stored
  on project.
- **Ref frame:** SMPTE at file position (or frame index internally); Set from
  playhead; draggable orange marker; pre-roll shading before reference.
- **Playhead + cue In/Out:** subtitle SMPTE only.

Export dialog: remove duplicate offset editor; show read-only summary of start
TC + reference frame + preview.

---

## Implementation plan

### Phase 1 — Core time model

**Goal:** Rational frame math and project fields; no UI change yet.

- [ ] Add `fpsNumerator`, `fpsDenominator` to `Project` (keep or deprecate `fps`).
- [ ] Add `referenceFrame` (or migrate from `contentStartSeconds`).
- [ ] Change `DEFAULT_TIMECODE_OFFSET` to `00:00:00:00`.
- [ ] Implement `lib/frame-time.ts` (or extend `timecode.ts`):
  - `secondsToFrame`, `frameToSeconds`, `frameToSubtitleTc`, `subtitleTcToFrame`
  - nominal fps derivation: `round(num/den)`
- [ ] Migrate cue model: `startFrame` / `endFrame` (+ load migration from seconds).
- [ ] Bump `PROJECT_VERSION`; update `project-schema.ts` and tests.
- [ ] On video link: copy probed rate to project fps fields.

### Phase 2 — Single subtitle display layer

**Goal:** Remove File/Program toggle; all fields show subtitle SMPTE.

- [ ] Rewrite `display-time.ts` (drop `TimeReference`).
- [ ] Delete `store/time-reference.ts`, `lib/time-reference-settings.ts`.
- [ ] Update `CueTimeField`, `CueTransport`, shortcuts (nudge uses rational frame).
- [ ] Snap set In/Out, seek-from-TC, program-start set to frame grid.
- [ ] Update `import-whisperx.ts` to store frames.

### Phase 3 — Timeline toolbar & marker

**Goal:** New time-mapping UI; remove parallel timelines.

- [ ] Replace `ProgramStartPanel` with time-mapping toolbar (start TC + ref frame).
- [ ] Update `ProgramStartHelpDialog` → time-mapping help.
- [ ] Reference marker label/tooltip in subtitle SMPTE.
- [ ] `formatTimelineViewRange` → subtitle SMPTE.

### Phase 4 — Peaks axis & playhead labels

**Goal:** Ruler and playhead show subtitle time.

- [ ] Custom Peaks formatters for axis + `showPlayheadTime`.
- [ ] Wire `layer.formatTime` on program-start marker to subtitle SMPTE.
- [ ] Verify zoom/scroll still correct (internal file seconds unchanged).

### Phase 5 — Export & docs

**Goal:** Consistent export; user-facing docs updated.

- [ ] Unify export paths (`export-srt`, `export-vtt`, `export-ass`, `export-csv`).
- [ ] Simplify `ExportDialog` (no separate broadcast offset; preview uses subtitle TC).
- [ ] Update `app/README.md` delivery section.
- [ ] Update in-app help (`HelpOverlay`, shortcuts descriptions).

### Phase 6 — Tests & edge cases

- [ ] Unit tests: `24000/1001`, `25/1`, start TC `01:00:00:00`, reference frame > 0.
- [ ] Round-trip: type TC → frame → TC, nudge, export preview.
- [ ] Legacy project load migration test.
- [ ] Manual QA: link 23.976 video, set US start TC, export CSV.

---

## File touch list (approximate)

| Area           | Files                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Types & schema | `types.ts`, `project-schema.ts`, `create-empty-project.ts`, `import-whisperx.ts`                                          |
| Time math      | `timecode.ts`, new frame helpers, `display-time.ts`, `program-start.ts`                                                   |
| Remove         | `store/time-reference.ts`, `lib/time-reference-settings.ts`                                                               |
| UI             | `ProgramStartPanel.tsx`, `WaveformTimeline.tsx`, `CueTimeField.tsx`, `CueTransport.tsx`, `ExportDialog.tsx`, help dialogs |
| Timeline       | `useWaveformPeaksTimeline.ts`, `program-start-point-marker.ts`                                                            |
| Export         | `export-*.ts`, `export-hints.ts`                                                                                          |
| Store          | `project.ts` (setters, migration)                                                                                         |
| Video          | video link flow (copy fps to project)                                                                                     |
| Tests          | `timecode.test.ts`, `display-time.test.ts`, `program-start.test.ts`, export tests, schema tests                           |

---

## Open decisions (resolve during Phase 1)

1. **Rename `timecodeOffset` → `startTimecode` in JSON?** Compatible alias on load
   recommended if renamed.
2. **Snap WhisperX word timings on import?** Recommended for consistency.
3. **Keep deprecated `fps: number` in JSON for one version?** Or migrate atomically
   with `PROJECT_VERSION` 2.

---

## References

- Current program start: `lib/program-start.ts`, `components/ProgramStartPanel.tsx`
- Video probe: `lib/mp4-probe.ts`, `lib/video-identity.ts`
- SMPTE (NDF): `lib/timecode.ts` — header notes non-drop-frame
