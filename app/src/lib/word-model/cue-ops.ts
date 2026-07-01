import type { Cue, ShotRange, Word } from "../../types";
import { replaceWordRangeFromText } from "./edit-words";
import {
  normalizeLineBreaks,
  remapLineBreaksAfterRangeReplace,
  shotRangeText,
  singleShotRange,
  effectiveShotRanges,
} from "./render";
import { joinTokens, parseEditableText, tokenize } from "./tokenize";
import {
  offsetWords,
  remapWordsToCueWindow,
  respreadCharacterWeighted,
  respreadInSpan,
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

export function emptyCueWords(_defaultShot: string): {
  words: Word[];
  shotRanges: ShotRange[];
} {
  return { words: [], shotRanges: [] };
}

export function newCueAtPlayhead(
  _start: number,
  _end: number,
  defaultShot: string,
): Pick<Cue, "words" | "shotRanges" | "lineBreakAfterWordIndices"> {
  return {
    words: [],
    shotRanges: [{ fromWord: 0, toWord: 0, shot: defaultShot }],
    lineBreakAfterWordIndices: [],
  };
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

export function splitCueAtTime(
  cue: Cue,
  splitTime: number,
  newId: () => string,
): [Cue, Cue] | null {
  const [leftWords, rightWords] = splitWordsAtTime(cue.words, splitTime);

  const splitWordIndex = leftWords.length;

  const leftBreaks = cue.lineBreakAfterWordIndices.filter(
    (i) => i < splitWordIndex - 1,
  );
  const rightBreaks = cue.lineBreakAfterWordIndices
    .filter((i) => i >= splitWordIndex)
    .map((i) => i - splitWordIndex);

  const leftRanges: ShotRange[] = [];
  const rightRanges: ShotRange[] = [];
  for (const r of cue.shotRanges) {
    if (r.toWord < splitWordIndex) {
      leftRanges.push({ ...r });
    } else if (r.fromWord >= splitWordIndex) {
      rightRanges.push({
        ...r,
        fromWord: r.fromWord - splitWordIndex,
        toWord: r.toWord - splitWordIndex,
      });
    } else {
      if (r.fromWord < splitWordIndex) {
        leftRanges.push({
          ...r,
          toWord: splitWordIndex - 1,
        });
      }
      if (r.toWord >= splitWordIndex) {
        rightRanges.push({
          ...r,
          fromWord: 0,
          toWord: r.toWord - splitWordIndex,
          shot: r.shot,
        });
      }
    }
  }

  if (leftWords.length === 0 || rightWords.length === 0) return null;

  const left: Cue = {
    ...cue,
    end: splitTime,
    words: leftWords,
    shotRanges: leftRanges.length ? leftRanges : [],
    lineBreakAfterWordIndices: normalizeLineBreaks(leftWords, leftBreaks),
    reviewed: false,
  };
  const right: Cue = {
    ...cue,
    id: newId(),
    start: splitTime,
    words: rightWords,
    shotRanges: rightRanges.length ? rightRanges : [],
    lineBreakAfterWordIndices: normalizeLineBreaks(rightWords, rightBreaks),
    reviewed: false,
  };
  return [left, right];
}

/** Split shot range at character offset within range text. */
export function insertShotSplitAtOffset(
  cue: Cue,
  rangeIndex: number,
  charOffset: number,
  nextShot: string,
): Cue {
  const range = cue.shotRanges[rangeIndex];
  if (!range) return cue;

  const slice = cue.words.slice(range.fromWord, range.toWord + 1);
  const fullText = slice.map((w) => w.text).join(" ");
  const leftText = fullText.slice(0, charOffset).trim();
  const rightText = fullText.slice(charOffset).trim();
  if (!leftText || !rightText) return cue;

  const leftTokens = tokenize(leftText);
  const rightTokens = tokenize(rightText);
  if (leftTokens.length === 0 || rightTokens.length === 0) return cue;

  const spanStart = slice[0].start;
  const spanEnd = slice[slice.length - 1].end;

  let leftWords = createWordsFromTokens(leftTokens, spanStart, spanEnd);
  let rightWords = createWordsFromTokens(rightTokens, spanStart, spanEnd);
  const splitAt = leftWords.length;
  leftWords = respreadInSpan(
    leftWords,
    spanStart,
    spanStart +
      (spanEnd - spanStart) *
        (leftTokens.length / (leftTokens.length + rightTokens.length)),
  );
  rightWords = respreadInSpan(
    rightWords,
    leftWords.at(-1)?.end ?? spanStart,
    spanEnd,
  );

  const prefix = cue.words.slice(0, range.fromWord);
  const suffix = cue.words.slice(range.toWord + 1);
  const words = [...prefix, ...leftWords, ...rightWords, ...suffix];

  const leftRange: ShotRange = {
    fromWord: range.fromWord,
    toWord: range.fromWord + leftWords.length - 1,
    shot: range.shot,
  };
  const rightRange: ShotRange = {
    fromWord: range.fromWord + splitAt,
    toWord: range.fromWord + splitAt + rightWords.length - 1,
    shot: nextShot,
  };

  const shotRanges = [
    ...cue.shotRanges.slice(0, rangeIndex),
    leftRange,
    rightRange,
    ...cue.shotRanges.slice(rangeIndex + 1).map((r) => ({
      ...r,
      fromWord:
        r.fromWord + leftWords.length + rightWords.length - slice.length,
      toWord: r.toWord + leftWords.length + rightWords.length - slice.length,
    })),
  ];

  return {
    ...cue,
    words,
    shotRanges,
    lineBreakAfterWordIndices: normalizeLineBreaks(
      words,
      cue.lineBreakAfterWordIndices,
    ),
  };
}

export function setShotRangeText(
  cue: Cue,
  rangeIndex: number,
  text: string,
  defaultShot: string,
): Cue {
  const ranges = effectiveShotRanges(cue, defaultShot);
  const range = ranges[rangeIndex];
  if (!range) return cue;

  if (cue.words.length === 0) {
    const { tokens, lineBreakAfterWordIndices: localBreaks } =
      parseEditableText(text);
    if (tokens.length === 0) return cue;
    const words = createWordsFromTokens(tokens, cue.start, cue.end);
    return {
      ...cue,
      words,
      shotRanges: singleShotRange(words.length, range.shot),
      lineBreakAfterWordIndices: normalizeLineBreaks(words, localBreaks),
    };
  }

  const { tokens, lineBreakAfterWordIndices: localBreaks } =
    parseEditableText(text);
  const words = replaceWordRangeFromText(
    cue.words,
    range.fromWord,
    range.toWord,
    joinTokens(tokens),
    cue.start,
    cue.end,
  );

  const oldSpan = range.toWord - range.fromWord + 1;
  const newSpan = tokens.length;
  const delta = newSpan - oldSpan;

  let shotRanges = cue.shotRanges;
  if (shotRanges.length === 0) {
    shotRanges =
      words.length > 0 ? singleShotRange(words.length, range.shot) : [];
  } else {
    shotRanges = shotRanges.map((r, i) => {
      if (i === rangeIndex) {
        return { ...r, toWord: r.fromWord + Math.max(newSpan, 1) - 1 };
      }
      if (r.fromWord > range.toWord) {
        return { ...r, fromWord: r.fromWord + delta, toWord: r.toWord + delta };
      }
      return r;
    });
  }

  return {
    ...cue,
    words,
    shotRanges,
    lineBreakAfterWordIndices: normalizeLineBreaks(
      words,
      remapLineBreaksAfterRangeReplace(
        cue.lineBreakAfterWordIndices,
        range.fromWord,
        range.toWord,
        localBreaks,
        delta,
      ),
    ),
  };
}

export function setShotRangeShot(
  cue: Cue,
  rangeIndex: number,
  shot: string,
): Cue {
  return {
    ...cue,
    shotRanges: cue.shotRanges.map((r, i) =>
      i === rangeIndex ? { ...r, shot } : r,
    ),
  };
}

export function rebuildSingleShotRange(cue: Cue, shot: string): Cue {
  if (cue.words.length === 0) return { ...cue, shotRanges: [] };
  return {
    ...cue,
    shotRanges: [{ fromWord: 0, toWord: cue.words.length - 1, shot }],
  };
}

export { splitWordTiming, mergeWordTiming } from "./timing";

/** Split cue at caret within a shot range; timing split at the caret word boundary. */
export function splitCueAtCaretOffset(
  cue: Cue,
  rangeIndex: number,
  charOffset: number,
  _splitTime: number,
  defaultShot: string,
  newId: () => string,
): [Cue, Cue] | null {
  const ranges = effectiveShotRanges(cue, defaultShot);
  const range = ranges[rangeIndex];
  if (!range) return null;

  const fullText = shotRangeText(cue, range);
  const leftText = fullText.slice(0, charOffset).trim();
  const rightText = fullText.slice(charOffset).trim();
  if (!leftText || !rightText) return null;
  if (cue.words.length === 0) return null;

  const leftTokens = tokenize(leftText);
  const splitWordIdx = range.fromWord + leftTokens.length;
  if (splitWordIdx <= 0 || splitWordIdx >= cue.words.length) return null;

  const words = replaceWordRangeFromText(
    cue.words,
    range.fromWord,
    range.toWord,
    `${leftText} ${rightText}`,
    cue.start,
    cue.end,
  );

  const wordTime = words[splitWordIdx]?.start ?? _splitTime;
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
