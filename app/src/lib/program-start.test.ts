import { describe, expect, it } from "vitest";
import {
  cuesBeforeReferenceStart,
  cueExportFrame,
  isCueBeforeReferenceStart,
  parseReferenceStartTimecode,
  referenceStartTimecode,
} from "./program-start";
import { exportCsv } from "./export-csv";
import { exportSrt } from "./export-srt";
import { exportAss } from "./export-ass";
import { DEFAULT_DIARIZED_EXPORT_OPTIONS } from "./export-format";
import { makeCue, makeProject } from "../test-fixtures";

const base = makeProject({
  name: "clip",
  videoName: "clip.mp4",
  startTimecode: "10:00:00:00",
  speakers: [],
  cues: [
    makeCue({ id: "c1", start: 65, end: 68, speakerId: null }, "Hello"),
    makeCue({ id: "c2", start: 10, end: 12, speakerId: null }, "Leader"),
  ],
});

describe("reference start helpers", () => {
  it("defaults reference start to zero", () => {
    expect(base.referenceStartSeconds).toBe(0);
  });

  it("finds cues before reference frame", () => {
    const project = { ...base, referenceStartSeconds: 60 };
    expect(cuesBeforeReferenceStart(project).map((c) => c.id)).toEqual(["c2"]);
  });

  it("marks a single cue invalid when In is before subtitle start", () => {
    const project = { ...base, referenceStartSeconds: 60 };
    expect(isCueBeforeReferenceStart(project.cues[1], project)).toBe(true);
    expect(isCueBeforeReferenceStart(project.cues[0], project)).toBe(false);
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
