import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseProjectData, projectSchema } from "./project-schema";
import { parseProject } from "./project-io";

const fixture = {
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

describe("parseProjectData", () => {
  it("accepts a valid project", () => {
    expect(parseProjectData(fixture)).toEqual(fixture);
  });

  it("rejects missing required fields", () => {
    expect(() => parseProjectData({ ...fixture, version: undefined })).toThrow(
      /Not a valid Subbit project file/,
    );
    expect(() => parseProjectData({ ...fixture, id: undefined })).toThrow(
      /Not a valid Subbit project file/,
    );
    expect(() => parseProjectData({ ...fixture, name: undefined })).toThrow(
      /Not a valid Subbit project file/,
    );
  });

  it("rejects cues with no segments", () => {
    expect(() =>
      parseProjectData({
        ...fixture,
        cues: [{ id: "c1", start: 0, end: 2, speakerId: null, segments: [] }],
      }),
    ).toThrow(/segments/);
  });

  it("accepts legacy video identity blocks and strips hash fields", () => {
    const parsed = parseProjectData({
      ...fixture,
      video: {
        fileSize: 123,
        duration: 100,
        fingerprint: "abc",
        fingerprintVersion: 1,
      },
    });
    expect(parsed.video).toEqual({ duration: 100 });
  });

  it("rejects invalid JSON via parseProject", () => {
    expect(() => parseProject("{not json")).toThrow(/whisperx audio\.json/);
  });
});

describe("real project file", () => {
  it("validates the sample subbit project fixture file", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const text = readFileSync(join(root, "data/movie.mp4.subbit.json"), "utf8");
    const data = JSON.parse(text);
    expect(projectSchema.safeParse(data).success).toBe(true);
  });
});
