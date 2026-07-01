import type { Word } from "../../types";
import { LCS_RESPREAD_THRESHOLD } from "./constants";
import { lcsMatchPairs, lcsMatchRatio } from "./lcs";
import { tokenize } from "./tokenize";
import { respreadCharacterWeighted, respreadInSpan } from "./timing";

function reconcileSlice(
  oldSlice: Word[],
  newTokens: string[],
  spanStart: number,
  spanEnd: number,
): Word[] {
  const pairs = lcsMatchPairs(
    oldSlice.map((w) => w.text),
    newTokens,
  );
  const newToOld = new Map(pairs.map(([oi, ni]) => [ni, oi]));

  const draft: Word[] = newTokens.map((text, ni) => {
    const oi = newToOld.get(ni);
    if (oi !== undefined) return { ...oldSlice[oi], text };
    return { text, start: spanStart, end: spanEnd };
  });

  const unmatched = draft.filter((_, ni) => !newToOld.has(ni));
  if (unmatched.length === 0) return draft;

  const respread = respreadInSpan(unmatched, spanStart, spanEnd);
  let u = 0;
  return draft.map((w, ni) => (newToOld.has(ni) ? w : respread[u++]));
}

/** Replace words in [fromWord..toWord] from edited shot-range text. */
export function replaceWordRangeFromText(
  words: Word[],
  fromWord: number,
  toWord: number,
  text: string,
  cueStart: number,
  cueEnd: number,
): Word[] {
  const newTokens = tokenize(text);
  const prefix = words.slice(0, fromWord);
  const suffix = words.slice(toWord + 1);
  const oldSlice = words.slice(fromWord, toWord + 1);

  if (newTokens.length === 0) return [...prefix, ...suffix];

  const spanStart = oldSlice[0]?.start ?? prefix.at(-1)?.end ?? cueStart;
  const spanEnd = oldSlice.at(-1)?.end ?? suffix[0]?.start ?? cueEnd;

  const ratio = lcsMatchRatio(
    oldSlice.map((w) => w.text),
    newTokens,
  );

  let middle: Word[];
  if (ratio < LCS_RESPREAD_THRESHOLD || oldSlice.length === 0) {
    middle = respreadInSpan(
      newTokens.map((t) => ({ text: t, start: spanStart, end: spanEnd })),
      spanStart,
      spanEnd,
    );
  } else {
    middle = reconcileSlice(oldSlice, newTokens, spanStart, spanEnd);
  }

  return [...prefix, ...middle, ...suffix];
}

/** Sync all cue words from full display text. */
export function syncCueWordsFromText(
  words: Word[],
  text: string,
  cueStart: number,
  cueEnd: number,
): Word[] {
  if (words.length === 0) {
    const tokens = tokenize(text);
    if (tokens.length === 0) return [];
    return respreadCharacterWeighted(
      tokens.map((t) => ({ text: t, start: cueStart, end: cueEnd })),
      cueStart,
      cueEnd,
    );
  }
  return replaceWordRangeFromText(
    words,
    0,
    words.length - 1,
    text,
    cueStart,
    cueEnd,
  );
}

export { lcsMatchPairs, lcsMatchRatio };
