import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../types";

// In-memory stand-in for idb-keyval so the history layer can be tested in node.
const db = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (k: string) => db.get(k)),
  set: vi.fn(async (k: string, v: unknown) => void db.set(k, v)),
  del: vi.fn(async (k: string) => void db.delete(k)),
  keys: vi.fn(async () => [...db.keys()]),
}));

import {
  addVersion,
  clearVersions,
  deleteVersion,
  getVersionText,
  listVersions,
} from "./history";

function makeProject(
  text = "hello",
  id = "00000000-0000-4000-8000-000000000001",
): Project {
  return {
    version: 2,
    id,
    name: "clip",
    videoName: "clip.mp4",
    fpsNumerator: 25,
    fpsDenominator: 1,
    startTimecode: "10:00:00:00",
    referenceStartSeconds: 0,
    defaultShot: "ON",
    shots: [{ id: "ON", label: "On-screen" }],
    speakers: [{ id: "SPEAKER_00", name: "A", color: "#fff" }],
    cues: [
      {
        id: "c1",
        start: 0,
        end: 2,
        speakerId: null,
        segments: [{ text, shot: "ON" }],
        reviewed: true,
      },
    ],
  };
}

const serialize = (p: Project) => JSON.stringify(p);

beforeEach(() => {
  db.clear();
});

describe("version history", () => {
  it("adds a version and reads it back", async () => {
    const p = makeProject();
    await addVersion(p, serialize(p));

    const list = await listVersions(p);
    expect(list).toHaveLength(1);
    expect(list[0].cueCount).toBe(1);
    expect(list[0].reviewedCount).toBe(1);
    expect(list[0].auto).toBe(false);

    const text = await getVersionText(p, list[0].id);
    expect(text).toBe(serialize(p));
  });

  it("skips a consecutive identical snapshot", async () => {
    const p = makeProject();
    await addVersion(p, serialize(p), { auto: true });
    await addVersion(p, serialize(p), { auto: true });
    expect(await listVersions(p)).toHaveLength(1);
  });

  it("still records an identical snapshot when it is explicitly labeled", async () => {
    const p = makeProject();
    await addVersion(p, serialize(p));
    await addVersion(p, serialize(p), { label: "milestone" });

    const list = await listVersions(p);
    expect(list).toHaveLength(2);
    expect(list[0].label).toBe("milestone");
  });

  it("records distinct snapshots newest-first", async () => {
    const a = makeProject("one");
    const b = makeProject("two", a.id);
    await addVersion(a, serialize(a));
    await addVersion(b, serialize(b));

    const list = await listVersions(a);
    expect(list).toHaveLength(2);
    expect(await getVersionText(a, list[0].id)).toBe(serialize(b));
    expect(await getVersionText(a, list[1].id)).toBe(serialize(a));
  });

  it("deletes a single version and its blob", async () => {
    const a = makeProject("one");
    const b = makeProject("two", a.id);
    await addVersion(a, serialize(a));
    const afterB = await addVersion(b, serialize(b));
    const removeId = afterB[1].id;

    const list = await deleteVersion(a, removeId);
    expect(list).toHaveLength(1);
    expect(await getVersionText(a, removeId)).toBeUndefined();
  });

  it("clears all versions for a project", async () => {
    const a = makeProject("one");
    const b = makeProject("two", a.id);
    await addVersion(a, serialize(a));
    await addVersion(b, serialize(b));

    await clearVersions(a);
    expect(await listVersions(a)).toHaveLength(0);
    expect(db.size).toBe(0);
  });
});
