# Word model (design spec)

Status: **approved for implementation** (greenfield — no migration from legacy
`segments[].text` projects).

This document is the source of truth for cues as word lists, line breaks, timing
reconciliation, and export projection. When behavior changes, update this file
and tests together.

---

## 1. Data model

### 1.1 Word

```ts
interface Word {
  text: string; // non-whitespace token; see §2
  start: number; // file-relative seconds
  end: number; // file-relative seconds, exclusive semantics match cue.end
  speaker?: string | null;
  score?: number;
}
```

### 1.2 Cue

```ts
interface Cue {
  id: string;
  start: number; // card In — independent of first word (reading time, etc.)
  end: number; // card Out — independent of last word
  speakerId: string | null;
  words: Word[];
  lineBreakAfterWordIndices: number[]; // display only; see §4
  shotRanges: { fromWord: number; toWord: number; shot: ShotId }[];
  reviewed?: boolean;
  inferredSpeaker?: InferredSpeaker | null;
}
```

- **Source of truth for text:** `words[]` (not parallel segment strings).
- **Shot ranges:** contiguous word indices, in order, covering all words exactly
  once.
- **Line breaks:** metadata on the cue; do not affect word timing.

### 1.3 Display text (derived)

Join words with a single ASCII space; insert `\n` after indices listed in
`lineBreakAfterWordIndices` (normalized, see §4).

For CSV export, render each shot slice separately and join with `/` (§4.6).

### 1.4 Derived text helpers

```ts
function normalizeLineBreaks(words: Word[], breaks: number[]): number[];

function renderWords(words: string[], breakAfter: number[]): string;
// Join with " "; insert "\n" after each index in breakAfter (normalized).

function cueDisplayText(cue: Cue): string;
// renderWords(cue.words.map(w => w.text), cue.lineBreakAfterWordIndices)

function cueReadableCharCount(cue: Cue): number;
// sum of cue.words[].text.length — used for cue CPS (§6.1); excludes all whitespace

function renderShotSlice(
  words: Word[],
  breakAfter: number[],
  fromWord: number,
  toWord: number,
): string;
// Slice [fromWord..toWord], rebase break indices into slice, renderWords.
```

**Preview / SRT / ASS** use `cueDisplayText(cue)` with `white-space: pre-wrap` so
`\n` line breaks are visible on video.

**CSV Subtitle column:** `shotRanges.map(r => renderShotSlice(...)).join(" / ")`.

### 1.5 Shot range invariants

- Ranges are contiguous, non-overlapping, in ascending `fromWord`.
- First range `fromWord === 0`; last range `toWord === words.length - 1`.
- Every word index belongs to exactly one range.
- Empty cue: no ranges (or disallow empty cues in schema).

---

## 2. Tokenization (v1)

On import and on every structured edit (§3), produce tokens as follows.

### 2.1 Whitespace

- Split on **any Unicode whitespace** (space, tab, newline, NBSP, …).
- Discard empty runs.
- **Collapse** between words: stored words contain no whitespace; rendering
  uses a single ` ` between words (except at line breaks).

### 2.2 Word characters (practical rule)

After whitespace normalization, each word is one **maximal non-whitespace run**
(`\S+` with Unicode).

Punctuation and quotes attach to the run as typed (WhisperX-style glue).

| Input             | Tokens              | Notes                                |
| ----------------- | ------------------- | ------------------------------------ |
| `Ginny, komm`     | `Ginny,` `komm`     | ASCII; comma glued                   |
| `l'homme`         | `l'homme`           | ASCII apostrophe inside run          |
| `don't`           | `don't`             |                                      |
| `Straße`          | `Straße`            | non-ASCII letter (`\p{L}`)           |
| `café rouge`      | `café` `rouge`      |                                      |
| `"Hello"`         | `"Hello"`           | quotes part of run when no space     |
| `extraordi- nary` | `extraordi-` `nary` | trailing `-` on first token (§4.3)   |
| `« Oui »`         | `«` `Oui` `»`       | spaces → separate punctuation tokens |
| `«Oui»`           | `«Oui»`             | no spaces → one token                |

**Hyphen convention (line breaks):** split a long token into two words manually;
first line ends with `-`, second has no leading hyphen: `extraordi-` + `nary`.

**Do not** auto-insert hyphens.

---

## 3. Edit operations

Edits are classified **immediately** (not only on blur). Paste and range delete
batch as **one undo step**. Blur still runs normalize + validation (§7) as a
safety net.

| Operation               | Detection                                       | Word / timing behavior                                          |
| ----------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| **Intra-word edit**     | Change inside one token; boundaries unchanged   | Update `text` only; **keep** `[start, end]`                     |
| **Split word**          | Space or newline inserted inside a former `\S+` | 1 → 2 words; **split** interval by character length ratio       |
| **Merge words**         | Space deleted between two tokens                | 2 → 1; **merge** to `[w1.start, w2.end]`                        |
| **Single-word replace** | Select one word and type replacement            | **Keep slot** timing at that index                              |
| **Range delete**        | Selection removes part or all of multiple words | Drop affected tokens; reconcile breaks (§4.4)                   |
| **Paste**               | Clipboard insert over a range                   | Tokenize paste; replace word span; LCS on affected range (§3.2) |
| **Whole-field replace** | Select-all + paste                              | Tokenize; LCS vs full cue; often **full respread** (§3.2)       |

### 3.1 Examples

**Typo (`beatiful` → `beautiful`):** intra-word edit → timing unchanged.

**Replace (`beautiful` → `gorgeous`):** single-word replace → keep slot timing.

**Insert space in `helloworld`:** split word → two tokens; split timing by length.

**Delete space in `hello world`:** merge → one token `[w1.start, w2.end]`.

### 3.2 LCS reconciliation (paste / large changes)

**LCS** = longest common subsequence of `text` on old vs new word lists (order
preserved, not necessarily contiguous).

| Condition                                | Action                                                            |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Matched tokens                           | Keep timings from matched old words                               |
| Unmatched new tokens                     | Interpolate (§6) in the time span of removed words, or within cue |
| Unmatched old tokens                     | Drop                                                              |
| LCS matches **< 50%** of new token count | **Full respread** across `[cue.start, cue.end]` (§6.6)            |

**Paste over selection:** remove words overlapping the selection; insert pasted
tokens; LCS within the replaced index range; interpolate in the combined time
span of removed words.

**Partial cue paste:** same as paste over selection (only affected indices).

---

## 4. Line breaks

### 4.1 Definition

`lineBreakAfterWordIndices`: sorted, unique integers `i` meaning: emit `\n`
**after** `words[i]` when rendering.

**Valid** iff `words.length >= 2` and every `i` satisfies `0 <= i <= words.length - 2`.

- No break before the first word (no index `-1`).
- No break after the last word (would create a trailing empty line).

Normalize on every write (§4.2).

### 4.2 Normalize (always)

```ts
function normalizeLineBreaks(words: Word[], breaks: number[]): number[] {
  if (words.length < 2) return [];
  return [...new Set(breaks)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i <= words.length - 2)
    .sort((a, b) => a - b);
}
```

Run on: tokenize/save, break insert/remove, load validation, blur.

### 4.3 Hyphen split (two lines, one long token)

Not a line-break index alone — split into two words:

`["extraordi-", "nary"]` + `lineBreakAfterWordIndices: [0]`.

### 4.4 Ambiguous breaks (user prompt)

When an anchor word for a break is removed (e.g. delete first word of a two-line
cue), show a dialog with **previews** (see §4.5). Safe default if dismissed:
**remove break**.

### 4.5 Prompt example

**Before:** `Hello` / `beautiful world` (break after index 0).

**After user deletes `Hello `:** text → `beautiful world`.

> **Line break needs a decision**  
> The break was after **“Hello”**, which is gone.
>
> **Remove line break**  
> Preview: `beautiful world`
>
> **Break before “world”**  
> Preview: `beautiful` / `world`

If the old second line has no recognizable anchor, only offer **Remove**.

**When “Break before …” makes sense:** the deleted word was **line 1**; the break
sat between line 1 and line 2. Removing line 1 does not mean the user wanted a
single line — **Break before the first word of the old line 2** preserves the
two-line layout. Example above: old line 2 was `beautiful world` → break before
`world` yields `beautiful` / `world`. Prefer **Remove** when the user clearly
collapsed to one phrase; offer **Break before** when the old second line had
multiple words and the break anchor (line 1) was removed.

### 4.6 Export projection

- **Preview / SRT / ASS:** `renderWords(all words, global break indices)`.
- **CSV:** for each shot range `[fromWord, toWord]`, rebase indices to the slice
  and render; join shot strings with `/`.

Breaks on a shot boundary (last word of ON) are valid: e.g.
`Hello\nbeautiful / world everyone`.

---

## 5. Cue timing vs word timing

### 5.1 Move whole cue

Apply the same offset δ to `cue.start`, `cue.end`, and **every** word:

```
t' = t + δ
```

Relative word spacing unchanged. Break indices and shot ranges unchanged.

### 5.2 Change cue In and/or Out only

**Do not** offset words. **Remap** each word time proportionally:

```
t' = newStart + (t - oldStart) × (newEnd - newStart) / (oldEnd - oldStart)
```

If `oldEnd === oldStart`, respread words evenly across the new window.

**Example — extend Out:** cue `[10, 20]` → `[10, 25]` (×1.5 scale); word
`[12, 14]` → `[10 + (12−10)×1.5, 10 + (14−10)×1.5]` = `[13, 16]`.

**Example — move In:** cue `[10, 20]` → `[12, 20]` (×0.8); word `[11, 13]` →
`[12.8, 14.4]`.

Cue bounds remain authoritative for the card; words may extend outside cue bounds
(validation warning, §7).

---

## 6. Reading speed, ε, and interpolation

There are **no per-word In/Out handles in v1**. If carving room for a new word
would leave any involved word shorter than the minimum readable duration, show a
validation warning and tell the user to **lengthen the cue** (adjust cue In/Out).

### 6.1 CPS and reading-time constants

**CPS** = **characters per second**: how many **readable characters** the viewer
must process per second while the cue is on screen. Count **letters, digits, and
punctuation** on the tokens; **do not** count spaces, tabs, or line breaks (those
are layout, not reading load).

```
cueReadableChars(cue) = sum(w.text.length for w in cue.words)
cueSeconds            = cue.end - cue.start
cueCPS                = cueReadableChars / cueSeconds   (skip if cueSeconds <= 0)
```

This matches stripping whitespace from display text (`cueDisplayText(cue)` with
all `\s` removed) but is simpler and does not depend on join rules.

Per-word `requiredDuration` already uses `w.text.length` (tokens are `\S+`), so
word-level and cue-level CPS use the **same notion of “character”.**

Professional targets (general adult audience):

| Guideline              | CPS         | Notes                                                                      |
| ---------------------- | ----------- | -------------------------------------------------------------------------- |
| Comfortable            | ~**17**     | Common broadcast / Netflix-style target                                    |
| Upper limit            | ~**20**     | Harder but still studied (Szarkowska et al., 2018, PLOS ONE)               |
| Minimum cue visibility | ~**0.83 s** | Full-card registration time (often ~20 frames @ 24 fps); **not** used as ε |

Subbit uses two derived constants for **timing math** and **validation**:

| Constant      | Value     | Rationale                                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MIN_PARSE_S` | **0.2 s** | Lower bound for **identifying a single short word** in time. Shorter than full-cue visibility (~0.83 s), which applies to an entire card. Eye-movement reading work often finds fixations on the order of **~200 ms** for short lexical access; we round to 0.2 s as a practical engineering floor. Used as **ε** (touching threshold) and as the minimum in `requiredDuration`. |
| `MAX_CPS`     | **20**    | Upper comfortable **reading** speed in characters per second. Aligns with Netflix adult cap and fast-subtitle eye-tracking conditions. Used to compute how long each **word token** should minimally occupy, and to warn when a **whole cue** packs too much text into its display window.                                                                                       |

**Required duration** for one word (minimum time that token should occupy):

```
requiredDuration(w) = max(MIN_PARSE_S, w.text.length / MAX_CPS)
```

Examples:

| Token       | Chars | requiredDuration                         |
| ----------- | ----- | ---------------------------------------- |
| `I`         | 1     | 0.2 s (`MIN_PARSE_S` wins)               |
| `Hello`     | 5     | 0.25 s (5 ÷ 20)                          |
| `beautiful` | 9     | 0.45 s                                   |
| `Ginny,`    | 6     | 0.3 s (punctuation counts toward length) |

**ε (touching threshold):** `ε = MIN_PARSE_S` (0.2 s). If `B.start - A.end <= ε`,
neighbors are **touching** — no usable gap; insert uses symmetric carve (§6.2 C).

#### Cue-level CPS (whole card)

Yes — `MAX_CPS` also drives a **separate cue-level warning**:

```
warn if cueCPS > MAX_CPS
```

**Example — too fast:**

```
cue [10, 13]  (3 s)
words: "This" "is" "a" "rather" "long" "line" "for" "three" "seconds"
readable chars = 45
cueCPS = 45 / 3 = 15   → OK

cue [10, 12]  (2 s), same words
cueCPS = 45 / 2 = 22.5 → WARN: "Too many characters for cue duration (22.5 CPS) —
lengthen cue Out or shorten text."
```

(Spaces between words in the display are **not** included in the 45.)

**Example — two lines:**

```
words total 38 readable chars, cue 1.8 s → 21.1 CPS → cue-level WARN
The "\n" between lines is not counted; neither are inter-word spaces.
```

Cue CPS and per-word `requiredDuration` are **complementary**:

| Check                       | Question                                                       |
| --------------------------- | -------------------------------------------------------------- |
| Per-word `requiredDuration` | Is this **token’s slot** long enough to parse that word?       |
| Cue CPS                     | Is the **whole card** too dense to read in the display window? |

References: subtitling.net / Netflix-style guides (~17 CPS target, 20 CPS cap);
Szarkowska, Krejtz, et al. (2018) _PLOS ONE_ (12 / 16 / 20 CPS eye-tracking);
broadcast min cue duration ~0.83 s for **full subtitle registration** (distinct
from per-word ε).

### 6.2 Insert between neighbors A and B

Let `need = requiredDuration(newWord)`, `gap = B.start - A.end`.

#### Strategy G — gap already large enough (`gap >= need`)

Assign **`[A.end, B.start]`** to the new word (split evenly if multiple inserts).

**Example:** A `[10, 12]`, B `[14, 16]`, insert `well` (need 0.2), gap 2.0  
→ `well [12, 14]`, A and B unchanged.

#### Strategy C — touching or gap too small (`gap < need`): **symmetric carve**

Carve **`need / 2`** from the **end of A** and **`need / 2`** from the **start of B**:

```
A' = [A.start, A.end - need/2]
B' = [B.start + need/2, B.end]
N  = [A'.end, B'.start]   // length = need
```

**Example:** A `[10, 12]`, B `[12, 14]` (touching), insert `well` (need 0.2)  
→ A `[10, 11.9]`, `well [11.9, 12.1]`, B `[12.1, 14]`.

**Example — not enough room:** A `[10, 10.15]`, B `[10.15, 10.3]` (0.15 s each),
insert `hello` (need 0.25). Carve 0.125 each → A duration 0.025 s < MIN_PARSE_S  
→ **warning:** “Not enough time for new word — lengthen cue In/Out.” Do not apply
carve; leave edit to text-only or queue warning until cue lengthened.

After any carve, if **A, N, or B** has duration `< requiredDuration(that word)`,
same warning.

### 6.3 Prefix insert (before first word) — v1 locked

**Interval:** `[cue.start, first.start]`. Let `gap = first.start - cue.start`.

1. **P-fill** (`gap >= need`): place new word at `[cue.start, cue.start + need]`.
   Do not move cue In. First word unchanged unless implementations choose to
   abut (`first.start` unchanged → gap shrinks).

2. **P-carve** (`gap < need`): extend new word into the gap, then carve
   `(need - gap)` from the **start** of the first word (`first.start` increases).
   Do **not** move cue In automatically. If first word would drop below
   `requiredDuration(first)` → **warning** (lengthen cue In/Out or shorten text).

**Example — P-fill:** cue `[10, 20]`, first `Hello [12, 14]`, insert `Well`
(need 0.2), gap 2.0 → `Well [10, 10.2]`, `Hello [12, 14]`.

**Example — P-carve:** cue `[10, 20]`, first `Hello [10.1, 12]`, gap 0.1, insert
`Well` (need 0.25) → need 0.15 more from first → `Well [10, 10.25]`,
`Hello [10.25, 12]` if room; else **warning**.

### 6.4 Suffix insert (after last word) — v1 locked

**Interval:** `[last.end, cue.end]`. Mirror of §6.3:

1. **S-fill** (`gap >= need`): `[last.end, last.end + need]`.
2. **S-carve** (`gap < need`): carve `(need - gap)` from **end** of last word.
   Do not move cue Out automatically. Warn if last word `< requiredDuration`.

**Example — S-fill:** last `[18, 18.5]`, cue Out `20`, insert `please` (0.3) →
`please [18.5, 18.8]`.

**Example — S-carve fail:** last `[19.85, 20]`, cue Out `20`, insert `please`
(0.3), gap 0 → carve 0.3 from last → duration 0 → **warning**.

### 6.5 Hyphen split (one word → two)

Split old `[start, end]` by **character length ratio** (trailing `-` counts toward
first part). No carve — both parts inherit subdivided interval.

**Example:** `extraordinary [10, 13]` (3 s, 12 chars) → `extraordi-` (8) +
`nary` (4) → `[10, 12]` + `[12, 13]`.

If either part's duration `< requiredDuration(part)` → **warning** (user should
lengthen cue or merge tokens).

### 6.6 Full respread (character-weighted)

When LCS match ratio **< 50%**, discard word timings and redistribute **`[cue.start, cue.end]`** across the new word list:

```
totalChars = sum(w.text.length for w in words)   // or 1 if empty
duration   = cue.end - cue.start
cursor     = cue.start

for each word w:
  slice = duration × (w.text.length / totalChars)
  w.start = cursor
  w.end   = cursor + slice
  cursor  = w.end
```

**Example:** cue `[10, 16]` (6 s), paste `Goodbye cruel world` (7 + 5 + 5 = 17 chars)

| Word    | Chars | Share | Interval       |
| ------- | ----- | ----- | -------------- |
| Goodbye | 7     | 7/17  | [10, 12.47]    |
| cruel   | 5     | 5/17  | [12.47, 14.24] |
| world   | 5     | 5/17  | [14.24, 16]    |

Single-word cue respread: entire `[cue.start, cue.end]` → that word.

After respread, run requiredDuration check on each word; flag if any below minimum
(suggest lengthening cue).

### 6.7 Paste / LCS partial respread

Matched words keep timings. Unmatched new words share the **combined time span of
removed words** in that range, distributed **character-weighted** within that span
(not the whole cue). If removed span is zero → fall back to Strategy C between
nearest neighbors.

**Example:** replace `beautiful [12, 14]` with `gorgeous wonderful` (9 + 9 chars)
in same slot → span [12, 14] (2 s) → `gorgeous [12, 13]`, `wonderful [13, 14]`.

### 3.3 Merge and split timing (detail)

**Split word** (space inserted inside token): old interval `[s, e]`, lengths `L1`,
`L2` by characters (including trailing `-` on first part):

```
first.end  = s + (e - s) × L1 / (L1 + L2)
second.start = first.end
second.end = e
```

**Merge words** (space deleted): `merged = [w1.start, w2.end]`, text concatenated
with a single space in display only (storage remains two tokens merged into one
token string without interior space unless user typed it).

---

## 7. Validation (derived, not stored)

Compute on read (never persisted):

| Issue                  | Condition                                                       | Tooltip (v1)                                                                   |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Word too short         | `word.end - word.start < requiredDuration(word)`                | “Word ‘…’ may be too short to read — lengthen cue In/Out.”                     |
| Cue CPS too high       | `cueCPS > MAX_CPS` (§6.1)                                       | “Too many characters for cue duration (N CPS) — lengthen cue or shorten text.” |
| Words outside cue      | word interval not within `[cue.start, cue.end]`                 | “Word timing outside cue In/Out.”                                              |
| Word overlap           | `word[i].end > word[i+1].start + ε`                             | “Word timings overlap.”                                                        |
| Carve / insert failure | symmetric or prefix/suffix carve would violate requiredDuration | “Not enough time for words — lengthen cue In/Out.”                             |
| Invalid breaks         | Fails `normalizeLineBreaks`                                     | Should not occur after normalize                                               |

**UI (v1):** amber badge on cue row; tooltip lists all issues for that cue. No
filter, no export dialog summary, no persistence in JSON. No per-word timing
handles in v1.

**Optional later (not v1):** soft target at **17 CPS** (informational only).

---

## 8. Import (WhisperX, greenfield)

- Build `words[]` from segment `words` when present; tokenize segment text with §2
  if needed for consistency.
- `lineBreakAfterWordIndices: []`
- Map each WhisperX segment to a shot range by consecutive word counts from
  tokenizing each segment's text in order.
- Cue `start`/`end` from segment; word timings from WhisperX.

---

## 9. Locked decisions checklist

| Topic                   | Decision                                                     |
| ----------------------- | ------------------------------------------------------------ |
| Cue move                | +δ on cue and all words                                      |
| In/Out edit             | Proportional remap (§5.2)                                    |
| Tokenization            | `\S+` after Unicode whitespace collapse (§2)                 |
| Large edit              | LCS; < 50% match → full respread                             |
| Typo / replace one word | Keep slot timing                                             |
| Line breaks             | Global indices; CSV per-shot rebase                          |
| Break ambiguity         | Prompt with previews (§4.5)                                  |
| Migration               | None — new schema only                                       |
| Validation              | Derived; row badge + tooltip                                 |
| ε / min duration        | `MIN_PARSE_S = 0.2`, `MAX_CPS = 20` (§6.1)                   |
| Touching insert         | Symmetric carve from A and B (§6.2 C)                        |
| Full respread           | Character-weighted (§6.6)                                    |
| Word timing UI          | None in v1 — lengthen cue                                    |
| Prefix / suffix insert  | P-fill then P-carve / S-fill then S-carve (§6.3–6.4)         |
| Cue CPS warning         | `sum(words[].text.length) / (cue.end - cue.start) > MAX_CPS` |

---

## 10. Implementation order (suggested)

1. Types + schema + `renderWords` / `normalizeLineBreaks`
2. Tokenize + edit operation handlers + LCS
3. Cue move / In/Out remap on word timings
4. Line break UI + ambiguity prompt
5. Replace segment UI with word-backed editor (or sync layer)
6. Export + preview using derived text
7. WhisperX import → word + shotRanges
