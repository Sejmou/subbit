import type { Cue } from "../types";

export interface TextMatch {
  cueId: string;
  segIndex: number;
  start: number;
  end: number;
}

export interface FindReplaceOptions {
  caseSensitive?: boolean;
}

/** All non-overlapping literal matches in cue segment text, in cue order. */
export function findTextMatches(
  cues: readonly Cue[],
  query: string,
  opts: FindReplaceOptions = {},
): TextMatch[] {
  if (!query) return [];

  const matches: TextMatch[] = [];
  const caseSensitive = opts.caseSensitive ?? false;

  for (const cue of cues) {
    for (let segIndex = 0; segIndex < cue.segments.length; segIndex++) {
      const text = cue.segments[segIndex].text;
      const haystack = caseSensitive ? text : text.toLowerCase();
      const needle = caseSensitive ? query : query.toLowerCase();
      let from = 0;
      while (from < haystack.length) {
        const idx = haystack.indexOf(needle, from);
        if (idx === -1) break;
        matches.push({
          cueId: cue.id,
          segIndex,
          start: idx,
          end: idx + query.length,
        });
        from = idx + Math.max(needle.length, 1);
      }
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

/** Apply many replacements within one segment (indices refer to the original text). */
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

/** Build segment text updates for replace-all across many matches. */
export function buildReplaceAllUpdates(
  cues: readonly Cue[],
  matches: readonly TextMatch[],
  replacement: string,
): SegmentTextUpdate[] {
  const bySegment = new Map<string, TextMatch[]>();
  for (const match of matches) {
    const key = `${match.cueId}:${match.segIndex}`;
    const list = bySegment.get(key);
    if (list) list.push(match);
    else bySegment.set(key, [match]);
  }

  const updates: SegmentTextUpdate[] = [];
  for (const [key, ranges] of bySegment) {
    const [cueId, segIndexStr] = key.split(":");
    const segIndex = Number(segIndexStr);
    const cue = cues.find((c) => c.id === cueId);
    if (!cue) continue;
    const text = replaceMatchesInText(
      cue.segments[segIndex].text,
      ranges,
      replacement,
    );
    updates.push({ cueId, segIndex, text });
  }
  return updates;
}
