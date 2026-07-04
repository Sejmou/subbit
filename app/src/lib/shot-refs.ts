import type { Cue, Project } from "../types";

export function cueReferencesShot(cue: Cue, shotId: string): boolean {
  return cue.shot === shotId;
}

/** Whether a shot id appears on any cue. */
export function isShotReferenced(project: Project, shotId: string): boolean {
  for (const cue of project.cues) {
    if (cueReferencesShot(cue, shotId)) return true;
  }
  return false;
}

/** Number of cues using a shot id. */
export function countCuesForShot(project: Project, shotId: string): number {
  let n = 0;
  for (const cue of project.cues) {
    if (cueReferencesShot(cue, shotId)) n++;
  }
  return n;
}

/** Cue counts keyed by shot id (only shots with at least one cue). */
export function countCueAppearancesByShot(
  project: Project,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const cue of project.cues) {
    counts.set(cue.shot, (counts.get(cue.shot) ?? 0) + 1);
  }
  return counts;
}

export function cueMatchesShotFilter(
  cue: Cue,
  filter: ReadonlySet<string>,
): boolean {
  if (filter.size === 0) return true;
  return filter.has(cue.shot);
}
