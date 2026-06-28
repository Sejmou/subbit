# Timeline & timecode redesign

Design reference for unifying the editor around **subtitle SMPTE time** — one
timeline, no File/Program toggle — with frame-accurate editing and project-scoped
configuration.

Status: **implemented** (project schema v2).

**Breaking change:** project JSON schema v2 replaces v1 on save. v1 `.subbit.json`
files load in memory and upgrade automatically (no cue timing changes).

---

## Mental model

Users work in **subtitle time** everywhere. The waveform and `<video>` element
still operate on **file time** (seconds from the start of the media file); only
labels and editable fields use SMPTE.

```text
subtitleTC = startTimecode + (fileSeconds − referenceStartSeconds)   // SMPTE, via frame math
fileSeconds = cue.start / cue.end / playhead                         // canonical storage
```

| Concept               | Project field                     | Meaning                                                              |
| --------------------- | --------------------------------- | -------------------------------------------------------------------- |
| **Start timecode**    | `startTimecode`                   | SMPTE at the reference point (`00:00:00:00` EU, `01:00:00:00` US, …) |
| **Reference start**   | `referenceStartSeconds` (float)   | Media seconds where subtitle timing begins (skips leader/black)      |
| **Media frame rate**  | `fpsNumerator` / `fpsDenominator` | Exact container rate (e.g. `24000/1001`)                             |
| **Nominal SMPTE fps** | (derived, not stored)             | Integer for `:FF` field — `round(num/den)` → `24`, `25`, `30`        |
| **Cue position**      | `start` / `end` (seconds)         | Float seconds from file start (WhisperX-aligned)                     |

### Removed (old schema)

| Old field / feature                                     | Replacement                                    |
| ------------------------------------------------------- | ---------------------------------------------- |
| `timecodeOffset`                                        | `startTimecode`                                |
| `contentStartSeconds`                                   | `referenceStartSeconds`                        |
| `fps` (number)                                          | `fpsNumerator` / `fpsDenominator`              |
| Cue `startFrame` / `endFrame`                           | `start` / `end` (seconds)                      |
| **`timeReference`** (`file` \| `program`, localStorage) | Single subtitle timeline from project settings |

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

1. **Storage:** cue `start` / `end` (float seconds from file start).
2. **Display:** seconds → subtitle SMPTE via start timecode, reference start,
   nominal fps (frame math at display time).
3. **Edit (type TC, set In/Out, nudge):** parse SMPTE → seconds → snap to frame
   boundary on commit; seek to snapped seconds.
4. **Playback while playing:** `video.currentTime` stays continuous; **shown**
   playhead rounds to nearest frame’s SMPTE (standard NLE behaviour).
5. **Peaks timeline:** scroll/zoom stays in file seconds; **axis labels, playhead
   label, marker tooltip, view-range text** use subtitle SMPTE formatters.
6. **Export:** subtitle-relative seconds from `(fileSeconds − referenceStart)`.

### WhisperX import

WhisperX timings are **file-relative float seconds** (audio-aligned, often
sub-frame). On import:

- Store `start` / `end` **unchanged** (preserve WhisperX alignment).
- Store word-level `start`/`end` as floats.

No reference start or start timecode in the import file — new projects default
to `referenceStartSeconds: 0` and start timecode `00:00:00:00`.

---

## Defaults for new projects

| Field                             | Default                   | Set when           |
| --------------------------------- | ------------------------- | ------------------ |
| `startTimecode`                   | `00:00:00:00`             | Project creation   |
| `referenceStartSeconds`           | `0`                       | Project creation   |
| `fpsNumerator` / `fpsDenominator` | `25/1`                    | Until video linked |
| Nominal SMPTE fps                 | `round(num/den)`          | Derived            |
| Cues                              | `start` / `end` (seconds) | Import or manual   |

When a video is linked, copy probed `frameRateNumerator/Denominator` from
`VideoIdentity` onto the project. Fallback `25/1` if probe fails.

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
custom formatters (axis ticks, playhead label, reference marker via
`layer.formatTime`). Expect Peaks integration work, not just CSS.

### Export formats

- **SRT/VTT/ASS:** subtitle time from `(frame − ref) + startTC`.
- **Delivery CSV:** same SMPTE formula; `startTimecode` is the only offset.

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
- **Ref frame:** subtitle SMPTE in the field; frame index internally; Set from
  playhead; draggable marker; pre-roll shading before reference.
- **Playhead + cue In/Out:** subtitle SMPTE only.

Export dialog: remove duplicate offset editor; show read-only summary of start
TC + reference frame + preview.

---

## Implementation plan

### Phase 1 — Core time model & schema break

**Goal:** New project shape and frame math; replace old fields everywhere in
code and tests. No load-time migration.

- [ ] Replace `Project` fields: `startTimecode`, `referenceFrame`,
      `fpsNumerator`, `fpsDenominator`; remove `timecodeOffset`, `contentStartSeconds`,
      `fps`.
- [ ] Replace cue `start`/`end` with `startFrame`/`endFrame`; update `Word` timing
      to frames if word arrays remain in schema.
- [ ] Bump `PROJECT_VERSION`; rewrite `project-schema.ts` (strict — old shape
      fails validation).
- [ ] Implement `lib/frame-time.ts` (or extend `timecode.ts`):
  - `secondsToFrame`, `frameToSeconds`, `frameToSubtitleTc`, `subtitleTcToFrame`
  - `nominalTimecodeFps(num, den)` → `round(num/den)`
- [ ] Update `create-empty-project.ts`, `import-whisperx.ts` defaults.
- [ ] On video link: copy probed rate to project fps fields.
- [ ] Fix all unit tests to use new schema (no dual-format fixtures).

### Phase 2 — Single subtitle display layer

**Goal:** Remove File/Program toggle; all fields show subtitle SMPTE.

- [ ] Rewrite `display-time.ts` around frame index + project timing settings.
- [ ] Delete `store/time-reference.ts`, `lib/time-reference-settings.ts`.
- [ ] Update `CueTimeField`, `CueTransport`, shortcuts (nudge uses rational frame).
- [ ] Snap set In/Out, seek-from-TC, reference-frame set to frame grid.
- [ ] Rewrite `program-start.ts` → reference-frame helpers (frame-based).

### Phase 3 — Timeline toolbar & marker

**Goal:** New time-mapping UI; remove parallel timelines.

- [ ] Replace `ProgramStartPanel` with time-mapping toolbar (start TC + ref frame).
- [ ] Update help dialog → time-mapping help.
- [ ] Reference marker label/tooltip in subtitle SMPTE.
- [ ] `formatTimelineViewRange` → subtitle SMPTE.

### Phase 4 — Peaks axis & playhead labels

**Goal:** Ruler and playhead show subtitle time.

- [ ] Custom Peaks formatters for axis + `showPlayheadTime`.
- [ ] Wire `layer.formatTime` on reference marker to subtitle SMPTE.
- [ ] Verify zoom/scroll still correct (internal file seconds unchanged).

### Phase 5 — Export & docs

**Goal:** Consistent export; user-facing docs updated.

- [ ] Rewrite export paths (`export-srt`, `export-vtt`, `export-ass`, `export-csv`)
      for frame-based cues.
- [ ] Simplify `ExportDialog` (no separate offset editor; preview uses subtitle TC).
- [ ] Update `app/README.md` delivery section (remove `10:00:00:00` default).
- [ ] Update in-app help (`HelpOverlay`, shortcuts descriptions).

### Phase 6 — Tests & QA

- [ ] Unit tests: `24000/1001`, `25/1`, start TC `01:00:00:00`, reference frame > 0.
- [ ] Round-trip: type TC → frame → TC, nudge, export preview.
- [ ] Schema rejection test: old project JSON fails parse with clear error.
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
| Store          | `project.ts` (setters only — no migration layer)                                                                          |
| Video          | video link flow (copy fps to project)                                                                                     |
| Tests          | all fixtures and tests using old field names                                                                              |

---

## References

- Current program start (to be replaced): `lib/program-start.ts`, `components/ProgramStartPanel.tsx`
- Video probe: `lib/mp4-probe.ts`, `lib/video-identity.ts`
- SMPTE (NDF): `lib/timecode.ts` — header notes non-drop-frame
