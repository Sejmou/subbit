import type { Cue, Project } from "../types";
import { cueMatchesSpeakerFilter } from "./speaker-refs";
import { cueMatchesShotFilter } from "./shot-refs";

export type ReviewStatusFilter = "reviewed" | "not-reviewed";
export type NoteFilter = "has-note" | "no-note";

export const REVIEW_STATUS_OPTIONS: {
  id: ReviewStatusFilter;
  label: string;
}[] = [
  { id: "reviewed", label: "Reviewed" },
  { id: "not-reviewed", label: "Not reviewed" },
];

export const NOTE_FILTER_OPTIONS: { id: NoteFilter; label: string }[] = [
  { id: "has-note", label: "Has note" },
  { id: "no-note", label: "No note" },
];

export function cueHasNote(cue: Cue): boolean {
  return !!cue.note?.trim();
}

export function cueMatchesNoteFilter(
  cue: Cue,
  filter: ReadonlySet<NoteFilter>,
): boolean {
  if (filter.size === 0) return true;
  const hasNote = cueHasNote(cue);
  if (filter.has("has-note") && hasNote) return true;
  if (filter.has("no-note") && !hasNote) return true;
  return false;
}

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
  noteFilter: readonly NoteFilter[] = [],
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
  if (
    noteFilter.length > 0 &&
    !cueMatchesNoteFilter(cue, new Set(noteFilter))
  ) {
    return false;
  }
  return true;
}

export function activeFilterCount(
  speakerFilter: readonly string[],
  statusFilter: readonly ReviewStatusFilter[],
  shotFilter: readonly string[] = [],
  noteFilter: readonly NoteFilter[] = [],
): number {
  return (
    speakerFilter.length +
    statusFilter.length +
    shotFilter.length +
    noteFilter.length
  );
}

export function hasActiveFilters(
  speakerFilter: readonly string[],
  statusFilter: readonly ReviewStatusFilter[],
  shotFilter: readonly string[] = [],
  noteFilter: readonly NoteFilter[] = [],
): boolean {
  return (
    speakerFilter.length > 0 ||
    statusFilter.length > 0 ||
    shotFilter.length > 0 ||
    noteFilter.length > 0
  );
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
