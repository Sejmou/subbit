import type { Cue, Word } from "../../types";

export function normalizeLineBreaks(words: Word[], breaks: number[]): number[] {
  if (words.length < 2) return [];
  return [...new Set(breaks)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i <= words.length - 2)
    .sort((a, b) => a - b);
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

/** Full editable text of a cue (all words, with its line breaks). */
export function cueDisplayText(cue: Cue): string {
  return renderWords(
    cue.words.map((w) => w.text),
    cue.lineBreakAfterWordIndices,
  );
}

export function cueReadableCharCount(cue: Cue): number {
  return cue.words.reduce((n, w) => n + w.text.length, 0);
}
