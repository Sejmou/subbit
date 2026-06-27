import { describe, expect, it } from "vitest";
import {
  parseSubtitleJsonText,
  projectFromSubtitleData,
} from "./load-subtitles";

const subbitFixture = {
  version: 1,
  videoName: "movie.mp4",
  fps: 25,
  timecodeOffset: "10:00:00:00",
  defaultShot: "ON",
  shots: [{ id: "ON", label: "On-screen" }],
  speakers: [{ id: "SPEAKER_00", name: "A", color: "#fff" }],
  cues: [
    {
      id: "c1",
      start: 0,
      end: 2,
      speakerId: "SPEAKER_00",
      segments: [{ text: "hello", shot: "ON" }],
    },
  ],
};

const whisperxFixture = {
  segments: [
    {
      start: 0,
      end: 1,
      text: "hello",
      speaker: "SPEAKER_00",
      words: [{ word: "hello", start: 0, end: 1, speaker: "SPEAKER_00" }],
    },
  ],
  language: "en",
};

describe("parseSubtitleJsonText", () => {
  it("rejects invalid JSON with a helpful message", () => {
    expect(() => parseSubtitleJsonText("{not json")).toThrow(
      /whisperx audio\.json/,
    );
  });
});

describe("projectFromSubtitleData", () => {
  it("loads a valid Subbit project", () => {
    expect(projectFromSubtitleData(subbitFixture, "movie.mp4")).toEqual(
      subbitFixture,
    );
  });

  it("loads valid whisperx JSON", () => {
    const project = projectFromSubtitleData(whisperxFixture, "movie.mp4");
    expect(project.cues).toHaveLength(1);
    expect(project.cues[0].segments[0].text).toBe("hello");
  });

  it("reports missing Subbit fields", () => {
    expect(() =>
      projectFromSubtitleData(
        { ...subbitFixture, speakers: undefined },
        "movie.mp4",
      ),
    ).toThrow(/missing the "speakers" array/);
  });

  it("reports unrecognized JSON with top-level keys", () => {
    expect(() => projectFromSubtitleData({ hi: "hello" }, "movie.mp4")).toThrow(
      /Found top-level keys: "hi"/,
    );
  });

  it("reports invalid whisperx segment shape", () => {
    expect(() =>
      projectFromSubtitleData({ segments: [{ text: "hello" }] }, "movie.mp4"),
    ).toThrow(/Not a valid whisperx file/);
  });
});
