import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { makeCue, makeProject } from "../test-fixtures";
import { parseProjectData, projectSchema } from "./project-schema";
import { parseProject } from "./project-io";
import { PROJECT_VERSION } from "../types";

const validFixture = makeProject({
  id: "00000000-0000-4000-8000-000000000001",
  name: "clip.mp4",
  cues: [
    makeCue({ id: "c1", start: 0, end: 2, speakerId: "SPEAKER_00" }, "hello"),
  ],
});

describe("parseProjectData", () => {
  it("accepts a valid v1 project", () => {
    const parsed = parseProjectData(validFixture);
    expect(parsed.version).toBe(PROJECT_VERSION);
    expect(parsed.cues[0].words[0].text).toBe("hello");
  });

  it("rejects missing required fields", () => {
    expect(() =>
      parseProjectData({ ...validFixture, version: undefined }),
    ).toThrow(/Not a valid Subbit project file/);
    expect(() => parseProjectData({ ...validFixture, id: undefined })).toThrow(
      /Not a valid Subbit project file/,
    );
    expect(() =>
      parseProjectData({ ...validFixture, name: undefined }),
    ).toThrow(/Not a valid Subbit project file/);
  });

  it("rejects legacy segment-based cues", () => {
    expect(() =>
      parseProjectData({
        ...validFixture,
        cues: [
          {
            id: "c1",
            start: 0,
            end: 2,
            speakerId: null,
            segments: [{ text: "hello", shot: "ON" }],
          },
        ],
      }),
    ).toThrow(/Not a valid Subbit project file/);
  });

  it("accepts legacy video identity blocks and strips hash fields", () => {
    const parsed = parseProjectData({
      ...validFixture,
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
  it.skip("validates the sample subbit project fixture file when present", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const path = join(root, "projects/movie.mp4.subbit.json");
    const text = readFileSync(path, "utf8");
    const data = JSON.parse(text);
    const project = parseProjectData(data);
    expect(project.version).toBe(PROJECT_VERSION);
    expect(projectSchema.safeParse(project).success).toBe(true);
  });
});
