import { describe, expect, it } from "vitest";
import { hexToAssColor, exportAss } from "./export-ass";
import type { Project } from "../types";

const project: Project = {
  version: 1,
  id: "00000000-0000-4000-8000-000000000001",
  name: "clip",
  videoName: "clip.mp4",
  fps: 25,
  timecodeOffset: "10:00:00:00",
  defaultShot: "ON",
  shots: [{ id: "ON", label: "On-screen" }],
  speakers: [
    { id: "SPEAKER_00", name: "Alice", color: "#e6194b" },
    { id: "SPEAKER_01", name: "Bob", color: "#4363d8" },
  ],
  cues: [
    {
      id: "c1",
      start: 1,
      end: 4,
      speakerId: "SPEAKER_00",
      segments: [{ text: "Hello", shot: "ON" }],
    },
    {
      id: "c2",
      start: 4.5,
      end: 7,
      speakerId: "SPEAKER_01",
      segments: [{ text: "Hi Alice", shot: "ON" }],
    },
  ],
};

describe("hexToAssColor", () => {
  it("converts #RRGGBB to ASS BGR", () => {
    expect(hexToAssColor("#e6194b")).toBe("&H004B19E6");
    expect(hexToAssColor("#4363d8")).toBe("&H00D86343");
  });
});

import { DEFAULT_DIARIZED_EXPORT_OPTIONS } from "./export-format";

describe("exportAss", () => {
  it("emits styles per speaker and colored dialogue lines", () => {
    const out = exportAss(project, DEFAULT_DIARIZED_EXPORT_OPTIONS);
    expect(out).toContain("[V4+ Styles]");
    expect(out).toContain("&H004B19E6");
    expect(out).toContain("&H00D86343");
    expect(out).toContain(
      "Dialogue: 0,0:00:01.00,0:00:04.00,Alice,Alice,0,0,0,,Hello",
    );
    expect(out).toContain(
      "Dialogue: 0,0:00:04.50,0:00:07.00,Bob,Bob,0,0,0,,Hi Alice",
    );
  });

  it("omits speaker styles and labels when disabled", () => {
    const out = exportAss(project, {
      speakerLabels: false,
      speakerColors: false,
    });
    expect(out).not.toContain("&H004B19E6");
    expect(out).toContain(
      "Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello",
    );
  });

  it("keeps labels without colors", () => {
    const out = exportAss(project, {
      speakerLabels: true,
      speakerColors: false,
    });
    expect(out).not.toContain("&H004B19E6");
    expect(out).toContain(
      "Dialogue: 0,0:00:01.00,0:00:04.00,Default,Alice,0,0,0,,Hello",
    );
  });
});
