import type { Cue } from "../types";

/** Binary search for the cue whose [start, end) contains t. */
export function findActiveCueIndex(cues: Cue[], t: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid];
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

export function findActiveCueId(cues: Cue[], t: number): string | null {
  const idx = findActiveCueIndex(cues, t);
  return idx >= 0 ? cues[idx].id : null;
}
