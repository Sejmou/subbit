import type { Project, ShotId, ShotType } from "../types";
import { DEFAULT_SHOTS } from "../types";

export const DEFAULT_SHOT_IDS = DEFAULT_SHOTS.map((s) => s.id);

export function isDefaultShotId(id: string): boolean {
  const key = id.toLowerCase();
  return DEFAULT_SHOT_IDS.some((shotId) => shotId.toLowerCase() === key);
}

/** Match a delivery Info token to a canonical shot id (by id or label). */
export function resolveShotLabel(
  raw: string,
  shots: readonly ShotType[],
  defaultShot: ShotId,
): ShotId {
  const trimmed = raw.trim();
  if (!trimmed) return defaultShot;

  const key = trimmed.toLowerCase();
  const match = shots.find(
    (s) => s.id.toLowerCase() === key || s.label.trim().toLowerCase() === key,
  );
  return match?.id ?? trimmed;
}

function shotLabelForImport(raw: string, resolvedId: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return resolvedId;
  const key = trimmed.toLowerCase();
  const existing = DEFAULT_SHOTS.find(
    (s) => s.id.toLowerCase() === key || s.label.trim().toLowerCase() === key,
  );
  if (existing) return existing.label;
  return trimmed;
}

/** Register unknown Info tokens as custom shot types on the project. */
export function ensureShotTypes(
  project: Project,
  rawLabels: Iterable<string>,
): { project: Project; addedShots: ShotType[] } {
  const shots = [...project.shots];
  const addedShots: ShotType[] = [];
  const existingIds = new Set(shots.map((s) => s.id.toLowerCase()));

  for (const raw of rawLabels) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const resolvedId = resolveShotLabel(trimmed, shots, project.defaultShot);
    if (existingIds.has(resolvedId.toLowerCase())) continue;

    const shot: ShotType = {
      id: resolvedId,
      label: shotLabelForImport(trimmed, resolvedId),
    };
    shots.push(shot);
    addedShots.push(shot);
    existingIds.add(resolvedId.toLowerCase());
  }

  if (addedShots.length === 0) return { project, addedShots };
  return { project: { ...project, shots }, addedShots };
}

/** Add shot types referenced by cues but missing from `project.shots`. */
export function syncShotTypesFromCues(project: Project): Project {
  const missing: string[] = [];
  const existingIds = new Set(
    project.shots.map((shot) => shot.id.toLowerCase()),
  );

  for (const cue of project.cues) {
    const shot = cue.shot.trim();
    if (!shot) continue;
    const key = shot.toLowerCase();
    if (existingIds.has(key)) continue;
    missing.push(shot);
    existingIds.add(key);
  }

  if (missing.length === 0) return project;
  return ensureShotTypes(project, missing).project;
}
