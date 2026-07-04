import type { Cue, Word } from "../../types";
import { replaceWordRangeFromText } from "./edit-words";
import { cueDisplayText, normalizeLineBreaks } from "./render";
import { parseEditableText, tokenize } from "./tokenize";
import {
  offsetWords,
  remapWordsToCueWindow,
  respreadCharacterWeighted,
  splitWordsAtTime,
} from "./timing";

export { replaceWordRangeFromText } from "./edit-words";

export function createWordsFromTokens(
  tokens: string[],
  start: number,
  end: number,
): Word[] {
  if (tokens.length === 0) return [];
  return respreadCharacterWeighted(
    tokens.map((text) => ({ text, start, end })),
    start,
    end,
  );
}

export function newCueAtPlayhead(
  _start: number,
  _end: number,
  defaultShot: string,
): Pick<Cue, "words" | "shot" | "lineBreakAfterWordIndices"> {
  return { words: [], shot: defaultShot, lineBreakAfterWordIndices: [] };
}

/** Apply cue start change with proportional word remap. */
export function applyCueStartChange(cue: Cue, newStart: number): Cue {
  if (newStart === cue.start) return cue;
  const words = remapWordsToCueWindow(
    cue.words,
    cue.start,
    cue.end,
    newStart,
    cue.end,
  );
  return { ...cue, start: newStart, words };
}

/** Apply cue end change with proportional word remap. */
export function applyCueEndChange(cue: Cue, newEnd: number): Cue {
  if (newEnd === cue.end) return cue;
  const words = remapWordsToCueWindow(
    cue.words,
    cue.start,
    cue.end,
    cue.start,
    newEnd,
  );
  return { ...cue, end: newEnd, words };
}

/** Move cue block — same δ on start, end, and all words. */
export function applyCueBlockMove(
  cue: Cue,
  newStart: number,
  newEnd: number,
): Cue {
  const delta = newStart - cue.start;
  if (newEnd - newStart !== cue.end - cue.start) {
    const words = remapWordsToCueWindow(
      cue.words,
      cue.start,
      cue.end,
      newStart,
      newEnd,
    );
    return { ...cue, start: newStart, end: newEnd, words };
  }
  return {
    ...cue,
    start: newStart,
    end: newEnd,
    words: offsetWords(cue.words, delta),
  };
}

/**
 * Split a cue into two at a time. The right half starts a new run
 * (`joinedToPrev: false`), so the split point becomes a run boundary; the left
 * half keeps its own `joinedToPrev`. Both keep the cue's shot and speaker.
 */
export function splitCueAtTime(
  cue: Cue,
  splitTime: number,
  newId: () => string,
): [Cue, Cue] | null {
  const [leftWords, rightWords] = splitWordsAtTime(cue.words, splitTime);
  if (leftWords.length === 0 || rightWords.length === 0) return null;

  const splitWordIndex = leftWords.length;
  const leftBreaks = cue.lineBreakAfterWordIndices.filter(
    (i) => i < splitWordIndex - 1,
  );
  const rightBreaks = cue.lineBreakAfterWordIndices
    .filter((i) => i >= splitWordIndex)
    .map((i) => i - splitWordIndex);

  const left: Cue = {
    ...cue,
    end: splitTime,
    words: leftWords,
    lineBreakAfterWordIndices: normalizeLineBreaks(leftWords, leftBreaks),
    reviewed: false,
  };
  const right: Cue = {
    ...cue,
    id: newId(),
    start: splitTime,
    words: rightWords,
    lineBreakAfterWordIndices: normalizeLineBreaks(rightWords, rightBreaks),
    joinedToPrev: false,
    reviewed: false,
  };
  return [left, right];
}

/** Replace a cue's full text (words + line breaks); shot is unchanged. */
export function setCueText(cue: Cue, text: string): Cue {
  const { tokens, lineBreakAfterWordIndices: localBreaks } =
    parseEditableText(text);
  const words = replaceWordRangeFromText(
    cue.words,
    0,
    cue.words.length - 1,
    tokens.join(" "),
    cue.start,
    cue.end,
  );
  return {
    ...cue,
    words,
    lineBreakAfterWordIndices: normalizeLineBreaks(words, localBreaks),
  };
}

/** Set a cue's shot type. */
export function setCueShot(cue: Cue, shot: string): Cue {
  return { ...cue, shot };
}

export { splitWordTiming, mergeWordTiming } from "./timing";

/** Split a cue at a caret offset within its display text. */
export function splitCueAtCaretOffset(
  cue: Cue,
  charOffset: number,
  newId: () => string,
): [Cue, Cue] | null {
  if (cue.words.length === 0) return null;
  const fullText = cueDisplayText(cue);
  const leftText = fullText.slice(0, charOffset).trim();
  const rightText = fullText.slice(charOffset).trim();
  if (!leftText || !rightText) return null;

  const splitWordIdx = tokenize(leftText).length;
  if (splitWordIdx <= 0 || splitWordIdx >= cue.words.length) return null;

  const words = replaceWordRangeFromText(
    cue.words,
    0,
    cue.words.length - 1,
    `${leftText} ${rightText}`,
    cue.start,
    cue.end,
  );

  const wordTime = words[splitWordIdx]?.start ?? cue.start;
  const mid: Cue = {
    ...cue,
    words,
    lineBreakAfterWordIndices: normalizeLineBreaks(
      words,
      cue.lineBreakAfterWordIndices,
    ),
  };
  return splitCueAtTime(mid, wordTime, newId);
}
