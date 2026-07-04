import type { Cue } from "../types";
import { cueMatchesSpeakerFilter } from "./speaker-refs";
import { cueMatchesShotFilter } from "./shot-refs";

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
