import type { Cue } from "../types";
import { groupCuesIntoRuns } from "./export-shot-ranges";

/**
 * Cues in strict temporal order (by start, then end). This is a *display/export*
 * view — it can interleave a foreign cue between two joined run members, so it
 * must not be written back to storage (that would break `joinedToPrev`, which
 * means "abutted to the array predecessor"). Use {@link normalizeCueOrder} for
 * storage.
 */
export function cuesByStartTime(cues: readonly Cue[]): Cue[] {
  return [...cues].sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Storage-order invariant: runs ordered by their first cue's start, with run
 * members kept contiguous so `joinedToPrev`-as-adjacency stays valid. This is
 * the closest to "sorted by start" that preserves run integrity — the only
 * deviation from a strict sort is a lone cue whose start falls inside a run's
 * span, which sorts after that run.
 *
 * Assumes runs are already contiguous in the input (they always are: joins,
 * inserts and deletes keep them so, and timing edits move values in place
 * without changing array positions). Returns the same array reference when
 * nothing moved, so callers can cheaply detect a no-op.
 */
export function normalizeCueOrder(cues: readonly Cue[]): Cue[] {
  const runs = groupCuesIntoRuns([...cues]);
  runs.sort((a, b) => a[0]!.start - b[0]!.start || a[0]!.end - b[0]!.end);
  const ordered = runs.flat();

  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i] !== cues[i]) return ordered;
  }
  return cues as Cue[];
}
