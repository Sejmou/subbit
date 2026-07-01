import { describe, expect, it } from "vitest";
import {
  parseSubtitleJsonText,
  projectFromSubtitleData,
} from "./load-subtitles";
import { cueShotText, makeCue, makeProject } from "../test-fixtures";
import { PROJECT_VERSION } from "../types";

const subbitFixture = makeProject({
  id: "00000000-0000-4000-8000-000000000001",
  name: "clip.mp4",
  videoName: "clip.mp4",
  cues: [
    makeCue({ id: "c1", start: 0, end: 2, speakerId: "SPEAKER_00" }, "hello"),
  ],
});

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
    const project = projectFromSubtitleData(subbitFixture, "clip.mp4");
    expect(project.version).toBe(PROJECT_VERSION);
    expect(project.cues[0].start).toBe(0);
    expect(project.cues[0].end).toBe(2);
  });

  it("loads valid whisperx JSON", () => {
    const project = projectFromSubtitleData(whisperxFixture, "clip.mp4");
    expect(project.cues).toHaveLength(1);
    expect(cueShotText(project.cues[0])).toBe("hello");
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
