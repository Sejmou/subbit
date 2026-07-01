import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Project } from "../types";
import { makeProject } from "../test-fixtures";
import { serializeProject } from "./project-io";

const stored = vi.hoisted(() => new Map<string, string>());
const meta = vi.hoisted(() => new Map<string, { savedAt: number }>());

vi.mock("./project-storage", () => ({
  loadStoredProjectText: vi.fn(async (id: string) => stored.get(id)),
  loadStoredProjectMeta: vi.fn(async (id: string) => meta.get(id) ?? null),
}));

import {
  detectBundleImportConflict,
  normalizeProjectTextForCompare,
  projectTextsEquivalent,
} from "./bundle-import-conflict";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";

function bundleText(project: Project): string {
  return serializeProject(project);
}

beforeEach(() => {
  stored.clear();
  meta.clear();
});

describe("bundle import conflict", () => {
  it("ignores videoName-only differences", () => {
    const base = makeProject({ id: PROJECT_ID, videoName: "a.mp4" });
    const other = { ...base, videoName: "b.mp4" };
    expect(projectTextsEquivalent(bundleText(base), bundleText(other))).toBe(
      true,
    );
    expect(normalizeProjectTextForCompare(bundleText(base))).toBe(
      normalizeProjectTextForCompare(bundleText(other)),
    );
  });

  it("detects no conflict when the project id is new to the browser", async () => {
    const project = makeProject({ id: PROJECT_ID });
    await expect(detectBundleImportConflict(bundleText(project))).resolves.toBe(
      null,
    );
  });

  it("detects no conflict when stored content matches the bundle", async () => {
    const project = makeProject({ id: PROJECT_ID, name: "Opernball" });
    stored.set(PROJECT_ID, bundleText(project));
    await expect(detectBundleImportConflict(bundleText(project))).resolves.toBe(
      null,
    );
  });

  it("detects conflict when the same id has different content", async () => {
    const storedProject = makeProject({ id: PROJECT_ID, name: "Opernball" });
    const bundleProject = makeProject({
      id: PROJECT_ID,
      name: "Opernball restored",
    });
    stored.set(PROJECT_ID, bundleText(storedProject));
    meta.set(PROJECT_ID, { savedAt: 1_700_000_000_000 });

    await expect(
      detectBundleImportConflict(bundleText(bundleProject)),
    ).resolves.toEqual({
      projectId: PROJECT_ID,
      projectName: "Opernball restored",
      cueCount: bundleProject.cues.length,
      savedAt: 1_700_000_000_000,
    });
  });
});
