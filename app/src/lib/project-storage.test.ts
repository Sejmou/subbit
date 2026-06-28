import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../types";

const db = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => db.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    db.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    db.delete(key);
  }),
  keys: vi.fn(async () => [...db.keys()]),
}));

import {
  buildStoredProjectMeta,
  deleteStoredProject,
  listStoredProjectSummaries,
  saveStoredProject,
  setActiveProjectId,
} from "./project-storage";

const PROJECT_ID_A = "00000000-0000-4000-8000-000000000001";
const PROJECT_ID_B = "00000000-0000-4000-8000-000000000002";
const PROJECT_ID_LEGACY = "00000000-0000-4000-8000-000000000099";

const project: Project = {
  version: 2,
  id: PROJECT_ID_A,
  name: "Episode 1",
  videoName: "ep01.mp4",
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
      start: 0,
      end: 1,
      speakerId: null,
      reviewed: true,
      segments: [{ text: "Hi", shot: "ON" }],
    },
    {
      id: "c2",
      start: 1,
      end: 2,
      speakerId: null,
      reviewed: false,
      segments: [{ text: "Bye", shot: "ON" }],
    },
  ],
};

describe("project-storage", () => {
  beforeEach(() => {
    db.clear();
  });

  it("builds meta from a project", () => {
    const meta = buildStoredProjectMeta(project);
    expect(meta.name).toBe("Episode 1");
    expect(meta.videoName).toBe("ep01.mp4");
    expect(meta.cueCount).toBe(2);
    expect(meta.reviewedCount).toBe(1);
    expect(meta.savedAt).toBeGreaterThan(0);
  });

  it("lists stored project summaries", async () => {
    await saveStoredProject(project, JSON.stringify(project));
    await setActiveProjectId(PROJECT_ID_B);
    const other = { ...project, id: PROJECT_ID_B, name: "Episode 2" };
    await saveStoredProject(other, JSON.stringify(other));

    const list = await listStoredProjectSummaries();
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.name).sort()).toEqual(["Episode 1", "Episode 2"]);
  });

  it("backfills meta from project JSON when missing", async () => {
    db.set(`subbit:project:${PROJECT_ID_LEGACY}`, JSON.stringify(project));
    const list = await listStoredProjectSummaries();
    expect(list).toHaveLength(1);
    expect(list[0].cueCount).toBe(2);
    expect(list[0].savedAt).toBe(0);
  });

  it("deletes project data from storage", async () => {
    await saveStoredProject(project, JSON.stringify(project));
    db.set(`subbit:project:${PROJECT_ID_A}:waveform`, { peaks: true });
    db.set(`subbit:history:${PROJECT_ID_A}`, [{ id: "v1" }]);
    db.set(`subbit:history:${PROJECT_ID_A}:v:v1`, "{}");

    expect(await deleteStoredProject(PROJECT_ID_A)).toBe(true);
    expect(await listStoredProjectSummaries()).toHaveLength(0);
    expect(db.has(`subbit:project:${PROJECT_ID_A}`)).toBe(false);
    expect(db.has(`subbit:project:${PROJECT_ID_A}:meta`)).toBe(false);
    expect(db.has(`subbit:project:${PROJECT_ID_A}:waveform`)).toBe(false);
    expect(db.has(`subbit:history:${PROJECT_ID_A}`)).toBe(false);
    expect(db.has(`subbit:history:${PROJECT_ID_A}:v:v1`)).toBe(false);
  });
});
