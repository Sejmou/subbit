import type { Cue } from "../types";

/** Cues overlapping the half-open time range [rangeStart, rangeEnd). */
export function findCuesOverlappingRange(
  cues: Cue[],
  rangeStart: number,
  rangeEnd: number,
): Cue[] {
  const out: Cue[] = [];
  for (const cue of cues) {
    if (cue.end <= rangeStart) continue;
    if (cue.start >= rangeEnd) continue;
    out.push(cue);
  }
  return out;
}

export function padViewRange(
  viewStart: number,
  viewEnd: number,
  opts?: { minPad?: number; ratio?: number },
): { start: number; end: number } {
  const minPad = opts?.minPad ?? 5;
  const ratio = opts?.ratio ?? 0.1;
  const span = Math.max(0, viewEnd - viewStart);
  const pad = Math.max(minPad, span * ratio);
  return { start: viewStart - pad, end: viewEnd + pad };
}

/** Ensure active/selected cues are included even if slightly off-screen. */
export function withPriorityCues(
  visible: Cue[],
  cues: Cue[],
  priorityIds: (string | null | undefined)[],
): Cue[] {
  const ids = new Set(visible.map((c) => c.id));
  const extra: Cue[] = [];
  for (const id of priorityIds) {
    if (!id || ids.has(id)) continue;
    const cue = cues.find((c) => c.id === id);
    if (cue) {
      extra.push(cue);
      ids.add(id);
    }
  }
  return extra.length ? [...visible, ...extra] : visible;
}
