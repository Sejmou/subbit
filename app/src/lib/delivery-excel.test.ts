import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  applyDeliveryImport,
  buildDeliveryRows,
  cuesFromDeliveryRows,
  splitDeliverySlices,
  type DeliveryRowValues,
} from "./delivery-rows";
import {
  exportDeliveryExcel,
  importDeliveryExcel,
  parseDeliveryExcel,
} from "./delivery-excel";
import { exportCsv } from "./export-csv";
import { DEFAULT_DELIVERY_COLUMNS } from "./delivery-columns";
import { cueDisplayText } from "./word-model/render";
import { makeCue, makeProject } from "../test-fixtures";

function writeBufferToArrayBuffer(
  buffer: Awaited<ReturnType<ExcelJS.Workbook["xlsx"]["writeBuffer"]>>,
): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) return buffer;
  const bytes = new Uint8Array(buffer as ArrayBufferLike);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

describe("splitDeliverySlices", () => {
  it("splits multi-shot values on ' / '", () => {
    expect(splitDeliverySlices("ON / OFF")).toEqual(["ON", "OFF"]);
  });
});

describe("cuesFromDeliveryRows", () => {
  it("parses timed rows with role and shot info", () => {
    const project = makeProject({
      startTimecode: "10:00:00:00",
      speakers: [],
      cues: [],
    });
    const rows: DeliveryRowValues[] = [
      {
        no: "1",
        timecodeIn: "10:01:03:16",
        timecodeOut: "10:01:04:24",
        role: "Lukas",
        info: "OFF",
        subtitle: "Ich habe nicht gefragt.",
      },
    ];
    const { cues, speakers } = cuesFromDeliveryRows(project, rows);
    expect(cues).toHaveLength(1);
    expect(speakers).toHaveLength(1);
    expect(speakers[0]?.name).toBe("Lukas");
    expect(cues[0]?.shot).toBe("OFF");
    expect(cues[0]?.words.map((w) => w.text).join(" ")).toBe(
      "Ich habe nicht gefragt.",
    );
  });

  it("resolves human-readable shot labels to ids", () => {
    const project = makeProject({ speakers: [], cues: [] });
    const rows: DeliveryRowValues[] = [
      {
        no: "1",
        timecodeIn: "",
        timecodeOut: "",
        role: "",
        info: "On-screen",
        subtitle: "Hello",
      },
    ];
    const { cues } = cuesFromDeliveryRows(project, rows);
    expect(cues[0]?.shot).toBe("ON");
  });

  it("splits a ' / ' subtitle into a joined run of cues", () => {
    const project = makeProject({
      startTimecode: "10:00:00:00",
      speakers: [],
      cues: [],
    });
    const rows: DeliveryRowValues[] = [
      {
        no: "1",
        timecodeIn: "10:00:01:00",
        timecodeOut: "10:00:05:00",
        role: "Anna",
        info: "ON / OFF",
        subtitle: "Hallo Welt / wie geht es",
      },
    ];
    const { cues, speakers } = cuesFromDeliveryRows(project, rows);
    expect(cues).toHaveLength(2);

    // first cue: shot ON, speaker Anna, run head
    expect(cues[0]?.shot).toBe("ON");
    expect(cues[0]?.joinedToPrev).toBeUndefined();
    expect(cues[0]?.speakerId).toBe(speakers[0]?.id);
    expect(cues[0]?.words.map((w) => w.text).join(" ")).toBe("Hallo Welt");

    // second cue: shot OFF, joined, no speaker
    expect(cues[1]?.shot).toBe("OFF");
    expect(cues[1]?.joinedToPrev).toBe(true);
    expect(cues[1]?.speakerId).toBeNull();
    expect(cues[1]?.words.map((w) => w.text).join(" ")).toBe("wie geht es");

    // cues abut in time
    expect(cues[0]?.end).toBeCloseTo(cues[1]?.start ?? 0, 5);
  });

  it("parses annotated SMPTE timecodes from delivery sheets", () => {
    const project = makeProject({
      startTimecode: "10:00:00:00",
      speakers: [],
      cues: [],
    });
    const rows: DeliveryRowValues[] = [
      {
        no: "1",
        timecodeIn: "10:02:29:18 (29:12)",
        timecodeOut: "10:02:30:07 (30:22)",
        role: "",
        info: "ON",
        subtitle: "Hallo",
      },
    ];
    const { cues } = cuesFromDeliveryRows(project, rows);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.start).toBeGreaterThan(0);
    expect(cues[0]?.end).toBeGreaterThan(cues[0]?.start ?? 0);
  });

  it("chains rows without timecodes", () => {
    const project = makeProject({ speakers: [], cues: [] });
    const rows: DeliveryRowValues[] = [
      {
        no: "1",
        timecodeIn: "",
        timecodeOut: "",
        role: "",
        info: "OFF",
        subtitle: "First line",
      },
      {
        no: "2",
        timecodeIn: "",
        timecodeOut: "",
        role: "",
        info: "OFF",
        subtitle: "Second line",
      },
    ];
    const { cues } = cuesFromDeliveryRows(project, rows);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.end).toBeCloseTo(cues[1]?.start ?? 0, 5);
  });
});

describe("delivery excel round-trip", () => {
  it("exports and re-imports cues with matching delivery fields", async () => {
    const project = makeProject({
      startTimecode: "10:00:00:00",
      speakers: [{ id: "s1", name: "Mia", color: "#fff" }],
      cues: [
        makeCue(
          {
            id: "c1",
            start: 65,
            end: 68,
            speakerId: "s1",
          },
          "Hello there",
        ),
      ],
    });

    const buffer = await exportDeliveryExcel(project);
    const imported = await importDeliveryExcel(
      { ...project, cues: [], speakers: [] },
      buffer,
    );

    expect(imported.cues).toHaveLength(1);
    expect(imported.speakers[0]?.name).toBe("Mia");
    expect(imported.cues[0]?.start).toBeCloseTo(65, 2);
    expect(imported.cues[0]?.end).toBeCloseTo(68, 2);
    expect(cueDisplayText(imported.cues[0]!)).toBe("Hello there");
  });

  it("round-trips a joined run through xlsx as one row", async () => {
    const project = makeProject({
      startTimecode: "10:00:00:00",
      speakers: [{ id: "s1", name: "Mia", color: "#fff" }],
      cues: [
        makeCue(
          { id: "c1", start: 65, end: 67, speakerId: "s1" },
          "Hello",
          "ON",
        ),
        {
          ...makeCue({ id: "c2", start: 67, end: 69 }, "there friend", "OFF"),
          joinedToPrev: true,
        },
      ],
    });

    const buffer = await exportDeliveryExcel(project);
    const rows = await parseDeliveryExcel(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.info).toBe("ON / OFF");
    expect(rows[0]?.subtitle).toBe("Hello / there friend");
    expect(rows[0]?.role).toBe("Mia");

    const imported = await importDeliveryExcel(
      { ...project, cues: [], speakers: [] },
      buffer,
    );
    expect(imported.cues).toHaveLength(2);
    expect(imported.cues[1]?.joinedToPrev).toBe(true);
    expect(imported.cues[0]?.shot).toBe("ON");
    expect(imported.cues[1]?.shot).toBe("OFF");
  });

  it("matches csv export row content", async () => {
    const project = makeProject({
      startTimecode: "10:00:00:00",
      referenceStartSeconds: 60,
      speakers: [{ id: "s1", name: "Mia", color: "#fff" }],
      cues: [
        makeCue({ id: "c1", start: 65, end: 68, speakerId: "s1" }, "Hello"),
      ],
    });
    const csv = exportCsv(project, "\t");
    const xlsx = await exportDeliveryExcel(project);
    const rows = await parseDeliveryExcel(xlsx);
    const csvLines = csv.split("\r\n");
    expect(rows[0]?.timecodeIn).toBe(csvLines[1]?.split("\t")[1]);
    expect(rows[0]?.subtitle).toBe("Hello");
  });
});

describe("parseDeliveryExcel", () => {
  it("reads a workbook with custom column names", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow([
      "No",
      "Timecode In",
      "Timecode Out",
      "Rolle",
      "Info",
      "Subtitle",
    ]);
    sheet.addRow([1, "10:00:01:00", "10:00:02:00", "Anna", "ON", "Hallo Welt"]);
    const ab = writeBufferToArrayBuffer(await workbook.xlsx.writeBuffer());
    const rows = await parseDeliveryExcel(ab);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("Anna");
    expect(rows[0]?.subtitle).toBe("Hallo Welt");
  });
});

describe("buildDeliveryRows", () => {
  it("uses configured header names", () => {
    const project = makeProject({ cues: [] });
    const rows = buildDeliveryRows(project, {
      ...DEFAULT_DELIVERY_COLUMNS,
      subtitle: "Text",
    });
    expect(rows[0]).toContain("Text");
  });
});

describe("applyDeliveryImport", () => {
  it("replaces cues while preserving project metadata", () => {
    const project = makeProject({ name: "Opernball", cues: [] });
    const next = applyDeliveryImport(project, [
      {
        no: "1",
        timecodeIn: "00:00:01:00",
        timecodeOut: "00:00:02:00",
        role: "",
        info: "ON",
        subtitle: "Test",
      },
    ]);
    expect(next.name).toBe("Opernball");
    expect(next.cues).toHaveLength(1);
  });

  it("registers custom shot types from the spreadsheet", () => {
    const project = makeProject({ cues: [] });
    const next = applyDeliveryImport(project, [
      {
        no: "1",
        timecodeIn: "",
        timecodeOut: "",
        role: "",
        info: "VO",
        subtitle: "Narration",
      },
    ]);
    expect(next.shots.map((s) => s.id)).toContain("VO");
    expect(next.cues[0]?.shot).toBe("VO");
  });
});
