import type { Cue, Project } from "../types";
import { cueMatchesSpeakerFilter } from "./speaker-refs";
import { cueMatchesShotFilter } from "./shot-refs";

export interface CueListEntry {
  cue: Cue;
  /** Index in the full project cue list. */
  index: number;
}

export type ReviewStatusFilter = "reviewed" | "not-reviewed";

export const REVIEW_STATUS_OPTIONS: {
  id: ReviewStatusFilter;
  label: string;
}[] = [
  { id: "reviewed", label: "Reviewed" },
  { id: "not-reviewed", label: "Not reviewed" },
];

export function cueMatchesReviewStatusFilter(
  cue: Cue,
  filter: ReadonlySet<ReviewStatusFilter>,
): boolean {
  if (filter.size === 0) return true;
  const reviewed = !!cue.reviewed;
  if (filter.has("reviewed") && reviewed) return true;
  if (filter.has("not-reviewed") && !reviewed) return true;
  return false;
}

export function cueMatchesListFilters(
  cue: Cue,
  speakerFilter: readonly string[],
  statusFilter: readonly ReviewStatusFilter[],
  shotFilter: readonly string[] = [],
): boolean {
  if (
    speakerFilter.length > 0 &&
    !cueMatchesSpeakerFilter(cue, new Set(speakerFilter))
  ) {
    return false;
  }
  if (
    shotFilter.length > 0 &&
    !cueMatchesShotFilter(cue, new Set(shotFilter))
  ) {
    return false;
  }
  if (
    statusFilter.length > 0 &&
    !cueMatchesReviewStatusFilter(cue, new Set(statusFilter))
  ) {
    return false;
  }
  return true;
}

export function activeFilterCount(
  speakerFilter: readonly string[],
  statusFilter: readonly ReviewStatusFilter[],
  shotFilter: readonly string[] = [],
): number {
  return speakerFilter.length + statusFilter.length + shotFilter.length;
}

export function hasActiveFilters(
  speakerFilter: readonly string[],
  statusFilter: readonly ReviewStatusFilter[],
  shotFilter: readonly string[] = [],
): boolean {
  return (
    speakerFilter.length > 0 || statusFilter.length > 0 || shotFilter.length > 0
  );
}

export function listFilteredCueEntries(
  cues: readonly Cue[],
  speakerFilter: readonly string[],
  statusFilter: readonly ReviewStatusFilter[],
  shotFilter: readonly string[] = [],
): CueListEntry[] {
  const all = cues.map((cue, index) => ({ cue, index }));
  if (!hasActiveFilters(speakerFilter, statusFilter, shotFilter)) return all;
  return all.filter(({ cue }) =>
    cueMatchesListFilters(cue, speakerFilter, statusFilter, shotFilter),
  );
}

/** Next/previous cue id within the filtered list, or null at the end. */
export function adjacentFilteredCueId(
  cues: readonly Cue[],
  selectedCueId: string | null,
  direction: -1 | 1,
  speakerFilter: readonly string[],
  statusFilter: readonly ReviewStatusFilter[],
  shotFilter: readonly string[] = [],
): string | null {
  const entries = listFilteredCueEntries(
    cues,
    speakerFilter,
    statusFilter,
    shotFilter,
  );
  if (entries.length === 0) return null;

  const visibleIdx = selectedCueId
    ? entries.findIndex((e) => e.cue.id === selectedCueId)
    : -1;

  if (visibleIdx < 0) {
    return entries[0].cue.id;
  }

  const nextIdx = visibleIdx + direction;
  if (nextIdx < 0 || nextIdx >= entries.length) return null;
  return entries[nextIdx].cue.id;
}

export function filteredCueNavBounds(
  cues: readonly Cue[],
  selectedCueId: string | null,
  speakerFilter: readonly string[],
  statusFilter: readonly ReviewStatusFilter[],
  shotFilter: readonly string[] = [],
): { canPrev: boolean; canNext: boolean } {
  return {
    canPrev:
      adjacentFilteredCueId(
        cues,
        selectedCueId,
        -1,
        speakerFilter,
        statusFilter,
        shotFilter,
      ) !== null,
    canNext:
      adjacentFilteredCueId(
        cues,
        selectedCueId,
        1,
        speakerFilter,
        statusFilter,
        shotFilter,
      ) !== null,
  };
}

/** Role counts for cues matching status and shot filters (speaker filter excluded). */
export function countCueAppearancesBySpeakerWithFilters(
  project: Project,
  statusFilter: readonly ReviewStatusFilter[],
  shotFilter: readonly string[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const cue of project.cues) {
    if (!cue.speakerId) continue;
    if (!cueMatchesReviewStatusFilter(cue, new Set(statusFilter))) continue;
    if (!cueMatchesShotFilter(cue, new Set(shotFilter))) continue;
    counts.set(cue.speakerId, (counts.get(cue.speakerId) ?? 0) + 1);
  }
  return counts;
}

/** Shot counts for cues matching role and status filters (shot filter excluded). */
export function countCueAppearancesByShotWithFilters(
  project: Project,
  speakerFilter: readonly string[],
  statusFilter: readonly ReviewStatusFilter[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const cue of project.cues) {
    if (!cueMatchesSpeakerFilter(cue, new Set(speakerFilter))) continue;
    if (!cueMatchesReviewStatusFilter(cue, new Set(statusFilter))) continue;
    counts.set(cue.shot, (counts.get(cue.shot) ?? 0) + 1);
  }
  return counts;
}
