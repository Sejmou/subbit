import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { exportCsv } from "./export-csv";
import { migrateV1ToV2 } from "./migrate-project-v1";
import { parseProjectData } from "./project-schema";
import { DEFAULT_SHOTS } from "../types";

const v1Fixture = {
  version: 1 as const,
  id: "00000000-0000-4000-8000-000000000001",
  name: "clip.mp4",
  videoName: "clip.mp4",
  fps: 25,
  timecodeOffset: "10:00:00:00",
  contentStartSeconds: 60,
  defaultShot: "ON",
  shots: [{ id: "ON", label: "On-screen" }],
  speakers: [{ id: "SPEAKER_00", name: "A", color: "#fff" }],
  cues: [
    {
      id: "c1",
      start: 65,
      end: 68,
      speakerId: "SPEAKER_00",
      segments: [{ text: "Hello", shot: "ON" }],
    },
    {
      id: "c2",
      start: 50,
      end: 55,
      speakerId: null,
      segments: [{ text: "Leader", shot: "ON" }],
    },
  ],
};

describe("migrateV1ToV2", () => {
  it("maps timing fields and keeps cue seconds unchanged", () => {
    const v2 = migrateV1ToV2(v1Fixture);
    expect(v2.version).toBe(2);
    expect(v2.startTimecode).toBe("10:00:00:00");
    expect(v2.referenceStartSeconds).toBe(60);
    expect(v2.fpsNumerator).toBe(25);
    expect(v2.fpsDenominator).toBe(1);
    expect(v2.cues).toEqual(v1Fixture.cues);
  });

  it("prefers rational fps from linked video metadata", () => {
    const v2 = migrateV1ToV2({
      ...v1Fixture,
      fps: 24,
      video: {
        duration: 100,
        frameRateNumerator: 24000,
        frameRateDenominator: 1001,
      },
    });
    expect(v2.fpsNumerator).toBe(24000);
    expect(v2.fpsDenominator).toBe(1001);
  });
});

describe("parseProjectData v1 upgrade", () => {
  it("loads v1 through parseProjectData", () => {
    const project = parseProjectData(v1Fixture);
    expect(project.version).toBe(2);
    expect(project.referenceStartSeconds).toBe(60);
    expect(project.cues[0].start).toBe(65);
  });

  it("preserves v1 export CSV semantics after migration", () => {
    const project = parseProjectData(v1Fixture);
    const out = exportCsv(project, "\t");
    expect(out).toContain("10:00:05:00");
    expect(out).toContain("10:00:08:00");
    expect(out).toMatch(/10:00:00:00.*Leader/);
  });

  it("migrates minimal early v1 projects without id or name", () => {
    const project = parseProjectData({
      version: 1,
      videoName: "clip.mp4",
      fps: 25,
      timecodeOffset: "10:00:00:00",
      defaultShot: "ON",
      shots: DEFAULT_SHOTS,
      speakers: [],
      cues: [],
    });
    expect(project.version).toBe(2);
    expect(project.name).toBe("clip.mp4");
    expect(project.referenceStartSeconds).toBe(0);
    expect(project.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("migrates when version is 2 but v1 timing fields remain", () => {
    const project = parseProjectData({
      version: 2,
      id: "00000000-0000-4000-8000-000000000001",
      name: "clip.mp4",
      videoName: "clip.mp4",
      fps: 25,
      timecodeOffset: "10:00:00:00",
      contentStartSeconds: 30,
      defaultShot: "ON",
      shots: DEFAULT_SHOTS,
      speakers: [],
      cues: [],
    });
    expect(project.referenceStartSeconds).toBe(30);
    expect(project.startTimecode).toBe("10:00:00:00");
  });

  it("repairs partial v2 saves missing referenceStartSeconds", () => {
    const project = parseProjectData({
      version: 2,
      id: "00000000-0000-4000-8000-000000000001",
      name: "clip.mp4",
      videoName: "clip.mp4",
      fpsNumerator: 25,
      fpsDenominator: 1,
      startTimecode: "10:00:00:00",
      defaultShot: "ON",
      shots: DEFAULT_SHOTS,
      speakers: [],
      cues: [
        {
          id: "c1",
          start: 1,
          end: 2,
          speakerId: null,
          segments: [{ text: "Hi", shot: "ON" }],
        },
      ],
    });
    expect(project.referenceStartSeconds).toBe(0);
  });

  it("repairs frame-based reference and cue fields from in-progress saves", () => {
    const project = parseProjectData({
      version: 2,
      id: "00000000-0000-4000-8000-000000000001",
      name: "clip.mp4",
      videoName: "clip.mp4",
      fpsNumerator: 25,
      fpsDenominator: 1,
      startTimecode: "00:00:00:00",
      referenceFrame: 50,
      defaultShot: "ON",
      shots: DEFAULT_SHOTS,
      speakers: [],
      cues: [
        {
          id: "c1",
          startFrame: 25,
          endFrame: 50,
          speakerId: null,
          segments: [{ text: "Hi", shot: "ON" }],
        },
      ],
    });
    expect(project.referenceStartSeconds).toBe(2);
    expect(project.cues[0].start).toBe(1);
    expect(project.cues[0].end).toBe(2);
  });
});

describe("real v1 project file", () => {
  it("loads projects/movie.mp4.subbit.json", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const data = JSON.parse(
      readFileSync(join(root, "projects/movie.mp4.subbit.json"), "utf8"),
    );
    expect(data.version).toBe(1);
    const project = parseProjectData(data);
    expect(project.version).toBe(2);
    expect(project.startTimecode).toBe("10:00:00:00");
    expect(project.cues.length).toBe(0);
  });
});
