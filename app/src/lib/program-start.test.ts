import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import {
  cuesBeforeReferenceStart,
  cueExportFrame,
  parseReferenceStartTimecode,
  referenceStartTimecode,
} from "./program-start";
import { exportCsv } from "./export-csv";
import { exportSrt } from "./export-srt";
import { exportAss } from "./export-ass";
import { DEFAULT_DIARIZED_EXPORT_OPTIONS } from "./export-format";

const base: Project = {
  version: 2,
  id: "00000000-0000-4000-8000-000000000001",
  name: "clip",
  videoName: "clip.mp4",
  fpsNumerator: 25,
  fpsDenominator: 1,
  startTimecode: "10:00:00:00",
  referenceStartSeconds: 0,
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

describe("reference start helpers", () => {
  it("defaults reference start to zero", () => {
    expect(base.referenceStartSeconds).toBe(0);
  });

  it("finds cues before reference frame", () => {
    const project = { ...base, referenceStartSeconds: 60 };
    expect(cuesBeforeReferenceStart(project).map((c) => c.id)).toEqual(["c2"]);
  });

  it("parses zero timecode as frame zero", () => {
    expect(parseReferenceStartTimecode("00:00:00:00", base)).toBe(0);
    expect(parseReferenceStartTimecode("", base)).toBe(0);
  });

  it("maps export frames relative to reference", () => {
    const project = { ...base, referenceStartSeconds: 60 };
    expect(cueExportFrame(project.cues[0].start, project)).toBe(125);
    expect(cueExportFrame(project.cues[1].start, project)).toBe(0);
  });

  it("shows reference as subtitle timecode", () => {
    expect(referenceStartTimecode({ ...base, referenceStartSeconds: 60 })).toBe(
      "10:00:00:00",
    );
    expect(
      referenceStartTimecode({
        ...base,
        startTimecode: "00:00:00:00",
        referenceStartSeconds: 60,
      }),
    ).toBe("00:00:00:00");
  });
});

describe("export with reference frame", () => {
  const project = { ...base, referenceStartSeconds: 60 };

  it("subtracts reference frame from SRT", () => {
    const out = exportSrt(project);
    expect(out).toContain("00:00:05,000 --> 00:00:08,000");
    expect(out).toContain("00:00:00,000 --> 00:00:00,000");
  });

  it("subtracts reference frame from delivery CSV and keeps start timecode", () => {
    const out = exportCsv(project, "\t");
    expect(out).toContain("10:00:05:00");
    expect(out).toContain("10:00:08:00");
  });

  it("subtracts reference frame from ASS", () => {
    const out = exportAss(project, DEFAULT_DIARIZED_EXPORT_OPTIONS);
    expect(out).toContain("Dialogue: 0,0:00:05.00,0:00:08.00");
  });
});
