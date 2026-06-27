import type { InferredSpeaker, Word } from "../types";

/** Auto-assign cue.speakerId when inferredSpeaker.confidence meets this threshold. */
export const SPEAKER_AUTO_ASSIGN_THRESHOLD = 0.75;

function wordDuration(w: Word): number {
  const duration = w.end - w.start;
  return duration > 0 ? duration : 0;
}

/**
 * Pick a diarization label from word-level speakers using duration-weighted
 * plurality. confidence is the winner's share of total labeled speech time.
 */
export function inferSpeakerFromWords(
  words: Word[] | undefined,
  segmentSpeaker: string | null | undefined,
): InferredSpeaker | null {
  const totals = new Map<string, number>();
  let totalDuration = 0;

  for (const w of words ?? []) {
    if (!w.speaker) continue;
    const duration = wordDuration(w);
    if (duration <= 0) continue;
    totals.set(w.speaker, (totals.get(w.speaker) ?? 0) + duration);
    totalDuration += duration;
  }

  if (totalDuration > 0) {
    let speakerId = "";
    let winnerDuration = 0;
    for (const [id, duration] of totals) {
      if (duration > winnerDuration) {
        speakerId = id;
        winnerDuration = duration;
      }
    }
    return { speakerId, confidence: winnerDuration / totalDuration };
  }

  if (segmentSpeaker) {
    return { speakerId: segmentSpeaker, confidence: 1 };
  }

  return null;
}

export function resolveSpeakerFromInference(inferred: InferredSpeaker | null): {
  speakerId: string | null;
  inferredSpeaker: InferredSpeaker | null;
} {
  if (!inferred) return { speakerId: null, inferredSpeaker: null };
  const speakerId =
    inferred.confidence >= SPEAKER_AUTO_ASSIGN_THRESHOLD
      ? inferred.speakerId
      : null;
  return { speakerId, inferredSpeaker: inferred };
}
