import {
  loadStoredProjectMeta,
  loadStoredProjectText,
} from "./project-storage";
import { parseProjectData } from "./project-schema";
import { serializeProject } from "./project-io";
import type { Project } from "../types";

export interface BundleImportConflict {
  projectId: string;
  projectName: string;
  cueCount: number;
  savedAt: number | null;
}

/** Normalize bundle/stored JSON so video filename hints do not false-trigger conflicts. */
export function normalizeProjectTextForCompare(text: string): string {
  const project = parseProjectData(JSON.parse(text));
  return serializeProject({ ...project, videoName: "" });
}

export function projectTextsEquivalent(a: string, b: string): boolean {
  return (
    normalizeProjectTextForCompare(a) === normalizeProjectTextForCompare(b)
  );
}

/** True when a bundle would overwrite different content for the same project id. */
export async function detectBundleImportConflict(
  bundleProjectText: string,
): Promise<BundleImportConflict | null> {
  let project: Project;
  try {
    project = parseProjectData(JSON.parse(bundleProjectText));
  } catch {
    return null;
  }

  const storedText = await loadStoredProjectText(project.id);
  if (!storedText) return null;
  if (projectTextsEquivalent(bundleProjectText, storedText)) return null;

  const meta = await loadStoredProjectMeta(project.id);
  return {
    projectId: project.id,
    projectName: project.name,
    cueCount: project.cues.length,
    savedAt: meta?.savedAt ?? null,
  };
}
