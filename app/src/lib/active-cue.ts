import type { Cue } from "../types";

/**
 * Index of the cue active at media time `t` (whose [start, end) contains t).
 *
 * Cues may overlap, so several can contain `t`; the one that STARTED most
 * recently wins (latest start; ties break to the earliest array index). Storage
 * is run-atomic ordered, not guaranteed strictly sorted by start, and overlaps
 * mean a binary search couldn't pick the right container anyway — so this is a
 * linear scan.
 */
export function findActiveCueIndex(cues: Cue[], t: number): number {
  let best = -1;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (t < c.start || t >= c.end) continue;
    if (best === -1 || c.start > cues[best].start) best = i;
  }
  return best;
}

export function findActiveCueId(cues: Cue[], t: number): string | null {
  const idx = findActiveCueIndex(cues, t);
  return idx >= 0 ? cues[idx].id : null;
}
