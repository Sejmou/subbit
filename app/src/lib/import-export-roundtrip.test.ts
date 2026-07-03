import { describe, expect, it } from "vitest";
import {
  buildExportFile,
  defaultExportRequest,
  type ExportFormat,
  type ExportRequest,
} from "./export-format";
import { importSubtitleFile } from "./import-format";
import { parseDeliveryExcel } from "./delivery-excel";
import { joinShotRanges } from "./export-shot-ranges";
import { makeCue, makeProject } from "../test-fixtures";
import type { Project } from "../types";

const baseProject = makeProject({
  name: "clip",
  videoName: "clip.mp4",
  startTimecode: "10:00:00:00",
  referenceStartSeconds: 60,
  speakers: [
    { id: "s1", name: "Mia", color: "#e6194b" },
    { id: "s2", name: "Tom", color: "#4363d8" },
  ],
  cues: [
    makeCue({ id: "c1", start: 65, end: 68, speakerId: "s1" }, "Hello there"),
    makeCue(
      { id: "c2", start: 70, end: 73.5, speakerId: "s2" },
      "How are you?",
    ),
  ],
});

function stableExportRequest(format: ExportFormat): ExportRequest {
  const request = defaultExportRequest(format);
  if (format === "ass" || format === "vtt") {
    return {
      ...request,
      diarized: { speakerLabels: true, speakerColors: false },
    };
  }
  return request;
}

function normalizeTextExport(text: string): string {
  return text.replace(/\r\n/g, "\n").trimEnd();
}

async function roundTripProject(
  project: Project,
  request: ExportRequest,
): Promise<Project> {
  const exported = await buildExportFile(project, request);
  const shell = { ...project, cues: [], speakers: [] };
  const data = exported.kind === "text" ? exported.content : exported.content;
  return importSubtitleFile(shell, request, data);
}

describe("subtitle import/export round-trip", () => {
  const formats: ExportFormat[] = ["srt", "vtt", "ass", "csv", "tsv", "xlsx"];

  it.each(formats)("preserves cue text and timing for %s", async (format) => {
    const request = stableExportRequest(format);
    const imported = await roundTripProject(baseProject, request);

    expect(imported.cues).toHaveLength(baseProject.cues.length);
    for (let i = 0; i < baseProject.cues.length; i++) {
      expect(joinShotRanges(imported.cues[i]!).subtitle).toBe(
        joinShotRanges(baseProject.cues[i]!).subtitle,
      );
      expect(imported.cues[i]?.start).toBeCloseTo(
        baseProject.cues[i]!.start,
        1,
      );
      expect(imported.cues[i]?.end).toBeCloseTo(baseProject.cues[i]!.end, 1);
    }
    if (
      format === "ass" ||
      format === "vtt" ||
      format === "csv" ||
      format === "tsv" ||
      format === "xlsx"
    ) {
      expect(imported.speakers.map((s) => s.name).sort()).toEqual(
        baseProject.speakers.map((s) => s.name).sort(),
      );
    }
  });

  it.each(["srt", "vtt", "ass", "csv", "tsv"] as const)(
    "re-exported %s text matches original export",
    async (format) => {
      const request = stableExportRequest(format);
      const first = await buildExportFile(baseProject, request);
      expect(first.kind).toBe("text");

      const imported = await roundTripProject(baseProject, request);
      const second = await buildExportFile(imported, request);
      expect(second.kind).toBe("text");

      expect(normalizeTextExport(second.content)).toBe(
        normalizeTextExport(first.content),
      );
    },
  );

  it("re-exported xlsx rows match original export", async () => {
    const request = stableExportRequest("xlsx");
    const first = await buildExportFile(baseProject, request);
    expect(first.kind).toBe("binary");

    const imported = await roundTripProject(baseProject, request);
    const second = await buildExportFile(imported, request);
    expect(second.kind).toBe("binary");

    const firstRows = await parseDeliveryExcel(first.content);
    const secondRows = await parseDeliveryExcel(second.content);
    expect(secondRows).toEqual(firstRows);
  });
});

describe("parseSrt", () => {
  it("reads basic cues", async () => {
    const { parseSrt } = await import("./import-srt");
    const blocks = parseSrt(`1
00:00:01,000 --> 00:00:04,000
Hello

2
00:00:04,500 --> 00:00:07,000
World`);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.text).toBe("Hello");
    expect(blocks[1]?.start).toBeCloseTo(4.5, 3);
  });
});
