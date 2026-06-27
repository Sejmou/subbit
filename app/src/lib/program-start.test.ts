import { describe, expect, it } from "vitest";
import {
  contentStartSeconds,
  cuesBeforeProgramStart,
  fileTimeToProgramTime,
  parseProgramStartTimecode,
} from "./program-start";
import type { Project } from "../types";
import { exportCsv } from "./export-csv";
import { exportSrt } from "./export-srt";
import { exportAss } from "./export-ass";
import { DEFAULT_DIARIZED_EXPORT_OPTIONS } from "./export-format";

const base: Project = {
  version: 1,
  id: "00000000-0000-4000-8000-000000000001",
  name: "clip",
  videoName: "clip.mp4",
  fps: 25,
  timecodeOffset: "10:00:00:00",
  defaultShot: "ON",
  shots: [{ id: "ON", label: "On-screen" }],
  speakers: [],
  cues: [
    {
      id: "c1",
      start: 65,
      end: 68,
      speakerId: null,
      segments: [{ text: "Hello", shot: "ON" }],
    },
    {
      id: "c2",
      start: 10,
      end: 12,
      speakerId: null,
      segments: [{ text: "Leader", shot: "ON" }],
    },
  ],
};

describe("program-start helpers", () => {
  it("defaults content start to zero", () => {
    expect(contentStartSeconds(base)).toBe(0);
  });

  it("converts file time to program time", () => {
    expect(fileTimeToProgramTime(65, 60)).toBe(5);
    expect(fileTimeToProgramTime(10, 60)).toBe(0);
  });

  it("finds cues before program start", () => {
    const project = { ...base, contentStartSeconds: 60 };
    expect(cuesBeforeProgramStart(project).map((c) => c.id)).toEqual(["c2"]);
  });

  it("parses zero timecode", () => {
    expect(parseProgramStartTimecode("00:00:00:00", 25)).toBe(0);
    expect(parseProgramStartTimecode("", 25)).toBe(0);
  });
});

describe("export with program start", () => {
  const project = { ...base, contentStartSeconds: 60 };

  it("subtracts program start from SRT", () => {
    const out = exportSrt(project);
    expect(out).toContain("00:00:05,000 --> 00:00:08,000");
    expect(out).toContain("00:00:00,000 --> 00:00:00,000");
  });

  it("subtracts program start from delivery CSV and keeps broadcast offset", () => {
    const out = exportCsv(project, "\t");
    expect(out).toContain("10:00:05:00");
    expect(out).toContain("10:00:08:00");
  });

  it("subtracts program start from ASS", () => {
    const out = exportAss(project, DEFAULT_DIARIZED_EXPORT_OPTIONS);
    expect(out).toContain("Dialogue: 0,0:00:05.00,0:00:08.00");
  });
});
