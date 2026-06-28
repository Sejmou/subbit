import { describe, expect, it } from "vitest";
import type { Word } from "../types";
import {
  inferSpeakerFromWords,
  resolveSpeakerFromInference,
  SPEAKER_AUTO_ASSIGN_THRESHOLD,
} from "./infer-speaker";

const word = (speaker: string, start: number, end: number): Word => ({
  word: "x",
  start,
  end,
  speaker,
});

describe("inferSpeakerFromWords", () => {
  it("uses duration-weighted plurality", () => {
    const inferred = inferSpeakerFromWords(
      [word("A", 0, 75), word("B", 75, 100)],
      null,
    );
    expect(inferred).toEqual({ speakerId: "A", confidence: 0.75 });
  });

  it("falls back to segment speaker when words lack labels", () => {
    expect(inferSpeakerFromWords([], "SPEAKER_00")).toEqual({
      speakerId: "SPEAKER_00",
      confidence: 1,
    });
  });

  it("returns null when there is nothing to infer", () => {
    expect(inferSpeakerFromWords(undefined, null)).toBeNull();
  });
});

describe("resolveSpeakerFromInference", () => {
  it("auto-assigns at or above the threshold", () => {
    expect(
      resolveSpeakerFromInference({
        speakerId: "A",
        confidence: SPEAKER_AUTO_ASSIGN_THRESHOLD,
      }),
    ).toEqual({
      speakerId: "A",
      inferredSpeaker: {
        speakerId: "A",
        confidence: SPEAKER_AUTO_ASSIGN_THRESHOLD,
      },
    });
  });

  it("leaves speakerId empty when confidence is low", () => {
    expect(
      resolveSpeakerFromInference({ speakerId: "A", confidence: 0.6 }),
    ).toEqual({
      speakerId: null,
      inferredSpeaker: { speakerId: "A", confidence: 0.6 },
    });
  });
});
