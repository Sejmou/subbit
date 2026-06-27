import type { TextMatch } from "./find-replace";

export interface FindHighlightState {
  active: boolean;
  matches: TextMatch[];
  currentMatch: TextMatch | null;
}

export const INACTIVE_FIND_HIGHLIGHT: FindHighlightState = {
  active: false,
  matches: [],
  currentMatch: null,
};

export type HighlightChunkKind = "plain" | "match" | "current";

export interface HighlightChunk {
  text: string;
  kind: HighlightChunkKind;
}

export function segmentMatchKey(cueId: string, segIndex: number): string {
  return `${cueId}:${segIndex}`;
}

export function indexMatchesBySegment(
  matches: readonly TextMatch[],
): Map<string, TextMatch[]> {
  const map = new Map<string, TextMatch[]>();
  for (const match of matches) {
    const key = segmentMatchKey(match.cueId, match.segIndex);
    const list = map.get(key);
    if (list) list.push(match);
    else map.set(key, [match]);
  }
  return map;
}

function isSameRange(
  a: Pick<TextMatch, "start" | "end">,
  b: Pick<TextMatch, "start" | "end"> | null,
): boolean {
  return b != null && a.start === b.start && a.end === b.end;
}

/** Split segment text into plain and highlighted spans for the mirror layer. */
export function buildHighlightChunks(
  text: string,
  ranges: readonly Pick<TextMatch, "start" | "end">[],
  current: Pick<TextMatch, "start" | "end"> | null,
): HighlightChunk[] {
  if (ranges.length === 0) return [{ text, kind: "plain" }];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const chunks: HighlightChunk[] = [];
  let cursor = 0;

  for (const range of sorted) {
    if (range.start > cursor) {
      chunks.push({ text: text.slice(cursor, range.start), kind: "plain" });
    }
    chunks.push({
      text: text.slice(range.start, range.end),
      kind: isSameRange(range, current) ? "current" : "match",
    });
    cursor = range.end;
  }

  if (cursor < text.length) {
    chunks.push({ text: text.slice(cursor), kind: "plain" });
  }

  return chunks;
}
