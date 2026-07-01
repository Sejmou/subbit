import type { Word } from "../../types";
import { MAX_CPS, MIN_PARSE_S } from "./constants";

export function requiredDuration(text: string): number {
  return Math.max(MIN_PARSE_S, text.length / MAX_CPS);
}

export function wordDuration(w: Word): number {
  return w.end - w.start;
}

export function epsilon(): number {
  return MIN_PARSE_S;
}

/** Proportional remap when cue In/Out window changes. */
export function remapWordsToCueWindow(
  words: Word[],
  oldStart: number,
  oldEnd: number,
  newStart: number,
  newEnd: number,
): Word[] {
  const oldSpan = oldEnd - oldStart;
  const newSpan = newEnd - newStart;
  if (words.length === 0) return words;
  if (oldSpan <= 0) {
    return respreadCharacterWeighted(words, newStart, newEnd);
  }
  const scale = newSpan / oldSpan;
  return words.map((w) => ({
    ...w,
    start: newStart + (w.start - oldStart) * scale,
    end: newStart + (w.end - oldStart) * scale,
  }));
}

/** Apply δ when the whole cue block moves. */
export function offsetWords(words: Word[], delta: number): Word[] {
  if (delta === 0) return words;
  return words.map((w) => ({
    ...w,
    start: w.start + delta,
    end: w.end + delta,
  }));
}

export function splitWordTiming(
  w: Word,
  leftText: string,
  rightText: string,
): [Word, Word] {
  const totalLen = leftText.length + rightText.length || 1;
  const span = w.end - w.start;
  const mid = w.start + span * (leftText.length / totalLen);
  return [
    { ...w, text: leftText, end: mid },
    { ...w, text: rightText, start: mid },
  ];
}

export function mergeWordTiming(a: Word, b: Word, text: string): Word {
  return {
    ...a,
    text,
    end: b.end,
    speaker: a.speaker ?? b.speaker,
    score: a.score ?? b.score,
  };
}

export function respreadCharacterWeighted(
  words: Word[],
  start: number,
  end: number,
): Word[] {
  if (words.length === 0) return words;
  const span = end - start;
  const totalChars =
    words.reduce((n, w) => n + Math.max(w.text.length, 1), 0) || 1;
  let cursor = start;
  return words.map((w, i) => {
    const slice =
      i === words.length - 1
        ? end - cursor
        : span * (Math.max(w.text.length, 1) / totalChars);
    const next: Word = { ...w, start: cursor, end: cursor + slice };
    cursor += slice;
    return next;
  });
}

export function respreadInSpan(
  words: Word[],
  start: number,
  end: number,
): Word[] {
  return respreadCharacterWeighted(words, start, end);
}

function carveFromEnd(w: Word, amount: number): Word {
  return { ...w, end: w.end - amount };
}

function carveFromStart(w: Word, amount: number): Word {
  return { ...w, start: w.start + amount };
}

export type InsertResult =
  | { ok: true; words: Word[]; insertIndex: number; inserted: Word }
  | { ok: false; reason: "no_room" };

/** Insert a new word between neighbors A (before) and B (after). */
export function insertWordBetween(
  words: Word[],
  insertIndex: number,
  text: string,
): InsertResult {
  const need = requiredDuration(text);
  const a = insertIndex > 0 ? words[insertIndex - 1] : undefined;
  const b = insertIndex < words.length ? words[insertIndex] : undefined;

  if (a && b) {
    const gap = b.start - a.end;
    if (gap >= need) {
      const inserted: Word = { text, start: a.end, end: a.end + need };
      const next = [...words];
      next.splice(insertIndex, 0, inserted);
      return { ok: true, words: next, insertIndex, inserted };
    }
    const half = need / 2;
    const aDur = wordDuration(a);
    const bDur = wordDuration(b);
    if (
      aDur - half < requiredDuration(a.text) ||
      bDur - half < requiredDuration(b.text)
    ) {
      return { ok: false, reason: "no_room" };
    }
    const newA = carveFromEnd(a, half);
    const newB = carveFromStart(b, half);
    const inserted: Word = { text, start: newA.end, end: newB.start };
    const next = [...words];
    next[insertIndex - 1] = newA;
    next.splice(insertIndex, 0, inserted);
    next[insertIndex + 1] = newB;
    return { ok: true, words: next, insertIndex, inserted };
  }

  if (!a && b) {
    const gap = b.start - (words[0]?.start ?? b.start);
    const cueStart = b.start - gap;
    if (gap >= need) {
      const inserted: Word = { text, start: cueStart, end: cueStart + need };
      const next = [inserted, ...words.map((w) => ({ ...w }))];
      return { ok: true, words: next, insertIndex: 0, inserted };
    }
    const carve = need - gap;
    if (wordDuration(b) - carve < requiredDuration(b.text)) {
      return { ok: false, reason: "no_room" };
    }
    const newB = carveFromStart(b, carve);
    const inserted: Word = { text, start: newB.start - need, end: newB.start };
    const next = [inserted, newB, ...words.slice(1)];
    return { ok: true, words: next, insertIndex: 0, inserted };
  }

  if (a && !b) {
    const gap = a.end;
    if (gap >= need) {
      const inserted: Word = { text, start: a.end, end: a.end + need };
      const next = [...words, inserted];
      return {
        ok: true,
        words: next,
        insertIndex: words.length,
        inserted,
      };
    }
    return { ok: false, reason: "no_room" };
  }

  const inserted: Word = { text, start: 0, end: need };
  return { ok: true, words: [inserted], insertIndex: 0, inserted };
}

export function splitWordsAtTime(
  words: Word[],
  splitTime: number,
): [Word[], Word[]] {
  const left = words.filter((w) => w.start < splitTime);
  const right = words.filter((w) => w.start >= splitTime);
  return [left, right];
}
