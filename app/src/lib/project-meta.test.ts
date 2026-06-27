import { describe, expect, it } from "vitest";
import {
  fallbackProjectName,
  resolveProjectName,
  suggestedExportFilename,
  suggestedProjectFilename,
} from "./project-meta";
import type { Project } from "../types";

const base: Project = {
  version: 1,
  id: "00000000-0000-4000-8000-000000000001",
  name: "clip.mp4",
  videoName: "clip.mp4",
  fps: 25,
  timecodeOffset: "10:00:00:00",
  defaultShot: "ON",
  shots: [{ id: "ON", label: "On-screen" }],
  speakers: [],
  cues: [],
};

describe("project meta", () => {
  it("falls back to the video filename", () => {
    expect(fallbackProjectName("clip.mp4")).toBe("clip.mp4");
    expect(fallbackProjectName("  sample.m4v  ")).toBe("sample.m4v");
    expect(fallbackProjectName("")).toBe("Untitled");
  });

  it("resolves blank input to the video filename", () => {
    expect(resolveProjectName("", "clip.mp4")).toBe("clip.mp4");
    expect(resolveProjectName("  ", "sample.m4v")).toBe("sample.m4v");
  });

  it("builds save and export filenames from the project name", () => {
    const project: Project = {
      ...base,
      name: "My Show: S01E02",
    };
    expect(suggestedProjectFilename(project)).toBe("My Show- S01E02.subbit.json");
    expect(suggestedExportFilename(project, "srt")).toBe("My Show- S01E02.srt");
  });
});
