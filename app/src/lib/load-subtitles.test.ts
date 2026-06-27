import { describe, expect, it } from "vitest";
import {
  parseSubtitleJsonText,
  projectFromSubtitleData,
} from "./load-subtitles";

const subbitFixture = {
  version: 1,
  id: "00000000-0000-4000-8000-000000000001",
  name: "clip.mp4",
  videoName: "clip.mp4",
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
    expect(projectFromSubtitleData(subbitFixture, "clip.mp4")).toEqual(
      subbitFixture,
    );
  });

  it("loads valid whisperx JSON", () => {
    const project = projectFromSubtitleData(whisperxFixture, "clip.mp4");
    expect(project.cues).toHaveLength(1);
    expect(project.cues[0].segments[0].text).toBe("hello");
    expect(project.id).toBeTruthy();
    expect(project.name).toBe("clip.mp4");
  });

  it("reports missing Subbit fields", () => {
    expect(() =>
      projectFromSubtitleData(
        { ...subbitFixture, speakers: undefined },
        "clip.mp4",
      ),
    ).toThrow(/missing the "speakers" array/);
  });

  it("reports unrecognized JSON with top-level keys", () => {
    expect(() => projectFromSubtitleData({ hi: "hello" }, "clip.mp4")).toThrow(
      /Found top-level keys: "hi"/,
    );
  });

  it("reports invalid whisperx segment shape", () => {
    expect(() =>
      projectFromSubtitleData({ segments: [{ text: "hello" }] }, "clip.mp4"),
    ).toThrow(/Not a valid whisperx file/);
  });
});
