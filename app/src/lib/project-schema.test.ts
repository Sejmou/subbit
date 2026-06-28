import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseProjectData, projectSchema } from "./project-schema";
import { parseProject } from "./project-io";

const v2Fixture = {
  version: 2,
  id: "00000000-0000-4000-8000-000000000001",
  name: "clip.mp4",
  videoName: "clip.mp4",
  fpsNumerator: 25,
  fpsDenominator: 1,
  startTimecode: "00:00:00:00",
  referenceStartSeconds: 0,
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

const v1Fixture = {
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
  it("accepts a valid v2 project", () => {
    expect(parseProjectData(v2Fixture)).toEqual(v2Fixture);
  });

  it("migrates v1 project shape to v2 on load", () => {
    const project = parseProjectData(v1Fixture);
    expect(project.version).toBe(2);
    expect(project.startTimecode).toBe("10:00:00:00");
    expect(project.referenceStartSeconds).toBe(0);
    expect(project.fpsNumerator).toBe(25);
    expect(project.cues[0].start).toBe(0);
  });

  it("rejects missing required fields", () => {
    expect(() =>
      parseProjectData({ ...v2Fixture, version: undefined }),
    ).toThrow(/Not a valid Subbit project file/);
    expect(() => parseProjectData({ ...v2Fixture, id: undefined })).toThrow(
      /Not a valid Subbit project file/,
    );
    expect(() => parseProjectData({ ...v2Fixture, name: undefined })).toThrow(
      /Not a valid Subbit project file/,
    );
  });

  it("rejects cues with no segments", () => {
    expect(() =>
      parseProjectData({
        ...v2Fixture,
        cues: [
          {
            id: "c1",
            start: 0,
            end: 2,
            speakerId: null,
            segments: [],
          },
        ],
      }),
    ).toThrow(/segments/);
  });

  it("accepts legacy video identity blocks and strips hash fields", () => {
    const parsed = parseProjectData({
      ...v2Fixture,
      video: {
        fileSize: 123,
        duration: 100,
        fingerprint: "abc",
        fingerprintVersion: 1,
      },
    });
    expect(parsed.video).toEqual({ duration: 100, fileSize: 123 });
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
    expect(parseProjectData(data).version).toBe(2);
    expect(projectSchema.safeParse(parseProjectData(data)).success).toBe(true);
  });
});
