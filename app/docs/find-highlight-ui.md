# Find & replace in-cue highlights

How search matches are shown inside cue text fields while find is active.

## Problem

A plain `<textarea>` cannot paint background colour (or other styling) on arbitrary character ranges. Find & replace needs inline highlight, including a distinct style for the current match, while the user can still type, select, and use keyboard shortcuts.

## Approach: mirror layer

Stack two visually aligned layers:

1. **Display layer**: shows the text with highlights applied (e.g. coloured spans). Not interactive; hidden from assistive tech so the real field remains the accessibility tree entry.
2. **Input layer**: the actual editable field. Text is invisible; only the caret (and focus ring) are visible. All editing behaviour stays here.

Both layers must use the same font metrics, padding, line breaking, and string content so highlights line up with the characters underneath.

## Turning matches into highlights

Search produces byte/character ranges within each segment's text: where a match starts and ends.
Before rendering, that string is split into alternating
**plain** and **highlighted** spans:

- text before the first match → plain
- each match → highlighted (one variant for "any match", another for "current match")
- gaps between matches → plain
- trailing text → plain

This is a presentation concern only — the stored subtitle text is unchanged.
The display layer consumes these spans; the input layer still holds one flat
string.

**Alignment rule:** the mirror must render exactly the same string the user sees
in the input, including any in-progress editing state (e.g. trailing spaces that
have not yet become a word). If the two strings diverge, highlights drift.

## Sizing the stack

Segment fields grow vertically as text wraps. The display layer is usually taken
out of normal document flow (so it can sit behind the input). That means the
container cannot rely on the display layer to establish height.

When highlights are on:

- **Height** — measure the input's content height and apply it to the shared
  container so the display layer fills the full editable area.
- **Width** — when the column resizes, wrapped line count changes; both layers
  must be re-measured so they stay the same size.

When highlights are off, only the input needs autosizing — there is no overlay
to keep in sync.

## Data flow (conceptual)

```text
User searches → matches per cue segment (offsets into segment text)
             → highlight state (all matches + which is current)
             → each visible segment field splits its text into spans
             → display layer paints spans; input layer stays editable
```

Matches are scoped per segment because each shot-range field is edited
independently.
