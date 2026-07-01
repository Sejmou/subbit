import type { Cue, ShotRange, Word } from "../../types";

export function normalizeLineBreaks(words: Word[], breaks: number[]): number[] {
  if (words.length < 2) return [];
  return [...new Set(breaks)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i <= words.length - 2)
    .sort((a, b) => a - b);
}

/** Keep breaks outside an edited word range; insert new breaks from parsed text. */
export function remapLineBreaksAfterRangeReplace(
  oldBreaks: number[],
  fromWord: number,
  toWord: number,
  newMiddleBreaks: number[],
  wordCountDelta: number,
): number[] {
  const external = oldBreaks.filter((i) => i < fromWord || i > toWord - 1);
  const shifted = external.map((i) => (i >= toWord ? i + wordCountDelta : i));
  const inserted = newMiddleBreaks.map((i) => fromWord + i);
  return [...shifted, ...inserted];
}

export function renderWords(wordTexts: string[], breakAfter: number[]): string {
  if (wordTexts.length === 0) return "";
  const breaks = new Set(
    normalizeLineBreaks(
      wordTexts.map((text) => ({ text, start: 0, end: 0 })),
      breakAfter,
    ),
  );
  let out = "";
  for (let i = 0; i < wordTexts.length; i++) {
    if (i > 0 && !breaks.has(i - 1)) out += " ";
    out += wordTexts[i];
    if (breaks.has(i)) out += "\n";
  }
  return out;
}

export function cueDisplayText(cue: Cue): string {
  return renderWords(
    cue.words.map((w) => w.text),
    cue.lineBreakAfterWordIndices,
  );
}

export function cueReadableCharCount(cue: Cue): number {
  return cue.words.reduce((n, w) => n + w.text.length, 0);
}

export function renderShotSlice(
  words: Word[],
  breakAfter: number[],
  fromWord: number,
  toWord: number,
): string {
  const slice = words.slice(fromWord, toWord + 1);
  const rebased = breakAfter
    .filter((i) => i >= fromWord && i <= toWord - 1)
    .map((i) => i - fromWord);
  return renderWords(
    slice.map((w) => w.text),
    rebased,
  );
}

export function shotRangeText(cue: Cue, range: ShotRange): string {
  return renderShotSlice(
    cue.words,
    cue.lineBreakAfterWordIndices,
    range.fromWord,
    range.toWord,
  );
}

export function defaultShotRange(defaultShot: string): ShotRange {
  return { fromWord: 0, toWord: 0, shot: defaultShot };
}

/** Build contiguous shot ranges covering all words (single default shot). */
export function singleShotRange(wordCount: number, shot: string): ShotRange[] {
  if (wordCount === 0) return [];
  return [{ fromWord: 0, toWord: wordCount - 1, shot }];
}

/** Shot ranges for UI/editing — empty cues show one blank range. */
export function effectiveShotRanges(
  cue: Cue,
  defaultShot: string,
): ShotRange[] {
  if (cue.shotRanges.length > 0) return cue.shotRanges;
  return [
    {
      fromWord: 0,
      toWord: Math.max(0, cue.words.length - 1),
      shot: defaultShot,
    },
  ];
}
