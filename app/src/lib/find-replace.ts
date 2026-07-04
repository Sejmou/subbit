import type { Cue } from "../types";
import { isReviewedCueLocked } from "./cue-lock";
import { cueDisplayText } from "./word-model/render";

export interface TextMatch {
  cueId: string;
  /** Always 0 — one segment per cue; retained for stable UI/highlight keys. */
  segIndex: number;
  start: number;
  end: number;
}

export interface FindReplaceOptions {
  caseSensitive?: boolean;
}

/** All non-overlapping literal matches in cue text, in cue order. */
export function findTextMatches(
  cues: readonly Cue[],
  query: string,
  opts: FindReplaceOptions = {},
): TextMatch[] {
  if (!query) return [];

  const matches: TextMatch[] = [];
  const caseSensitive = opts.caseSensitive ?? false;
  const needle = caseSensitive ? query : query.toLowerCase();

  for (const cue of cues) {
    const text = cueDisplayText(cue);
    const haystack = caseSensitive ? text : text.toLowerCase();
    let from = 0;
    while (from < haystack.length) {
      const idx = haystack.indexOf(needle, from);
      if (idx === -1) break;
      matches.push({
        cueId: cue.id,
        segIndex: 0,
        start: idx,
        end: idx + query.length,
      });
      from = idx + Math.max(needle.length, 1);
    }
  }

  return matches;
}

export function replaceMatchInText(
  text: string,
  match: Pick<TextMatch, "start" | "end">,
  replacement: string,
): string {
  return text.slice(0, match.start) + replacement + text.slice(match.end);
}

/** Apply many replacements within one cue (indices refer to the original text). */
export function replaceMatchesInText(
  text: string,
  matchRanges: readonly Pick<TextMatch, "start" | "end">[],
  replacement: string,
): string {
  let result = text;
  for (const { start, end } of [...matchRanges].sort(
    (a, b) => b.start - a.start,
  )) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
}

export interface SegmentTextUpdate {
  cueId: string;
  segIndex: number;
  text: string;
}

/** Matches in cues that are not locked by reviewed status. */
export function filterReplaceableMatches(
  matches: readonly TextMatch[],
  cues: readonly Cue[],
): TextMatch[] {
  const lockedIds = new Set(
    cues.filter((c) => isReviewedCueLocked(c)).map((c) => c.id),
  );
  if (lockedIds.size === 0) return [...matches];
  return matches.filter((m) => !lockedIds.has(m.cueId));
}

/** Build cue text updates for replace-all across many matches. */
export function buildReplaceAllUpdates(
  cues: readonly Cue[],
  matches: readonly TextMatch[],
  replacement: string,
): SegmentTextUpdate[] {
  const byCue = new Map<string, TextMatch[]>();
  for (const match of matches) {
    const list = byCue.get(match.cueId);
    if (list) list.push(match);
    else byCue.set(match.cueId, [match]);
  }

  const updates: SegmentTextUpdate[] = [];
  for (const [cueId, ranges] of byCue) {
    const cue = cues.find((c) => c.id === cueId);
    if (!cue) continue;
    const text = replaceMatchesInText(cueDisplayText(cue), ranges, replacement);
    updates.push({ cueId, segIndex: 0, text });
  }
  return updates;
}
