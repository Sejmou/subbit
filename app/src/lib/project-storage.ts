import { get, set, del, keys } from "idb-keyval";
import type { Project } from "../types";
import { parseProjectData } from "./project-schema";
import type { CachedWaveformPeaks } from "./waveform-cache";
import { clearProjectHistoryById } from "./history";

const ACTIVE_PROJECT_KEY = "subbit:activeProjectId";
const PROJECT_PREFIX = "subbit:project:";

function projectKey(id: string): string {
  return `${PROJECT_PREFIX}${id}`;
}

function projectMetaKey(id: string): string {
  return `${PROJECT_PREFIX}${id}:meta`;
}

function waveformKey(id: string): string {
  return `${PROJECT_PREFIX}${id}:waveform`;
}

export interface StoredProjectMeta {
  name: string;
  videoName: string;
  cueCount: number;
  reviewedCount: number;
  savedAt: number;
}

export interface StoredProjectSummary extends StoredProjectMeta {
  id: string;
}

export function buildStoredProjectMeta(project: Project): StoredProjectMeta {
  return {
    name: project.name,
    videoName: project.videoName,
    cueCount: project.cues.length,
    reviewedCount: project.cues.filter((c) => c.reviewed).length,
    savedAt: Date.now(),
  };
}

function extractProjectIdFromKey(key: string): string | null {
  if (!key.startsWith(PROJECT_PREFIX)) return null;
  const rest = key.slice(PROJECT_PREFIX.length);
  if (!rest || rest.includes(":")) return null;
  return rest;
}

export async function setActiveProjectId(id: string): Promise<void> {
  await set(ACTIVE_PROJECT_KEY, id);
}

export async function getActiveProjectId(): Promise<string | undefined> {
  return get<string>(ACTIVE_PROJECT_KEY);
}

/** Persist serialized project JSON in IndexedDB. */
export async function saveStoredProject(
  project: Project,
  text: string,
): Promise<void> {
  const meta = buildStoredProjectMeta(project);
  await set(projectKey(project.id), text);
  await set(projectMetaKey(project.id), meta);
  await setActiveProjectId(project.id);
}

export async function loadStoredProjectText(
  id: string,
): Promise<string | undefined> {
  return get<string>(projectKey(id));
}

export async function loadStoredProject(id: string): Promise<Project | undefined> {
  const text = await loadStoredProjectText(id);
  if (!text) return undefined;
  return parseProjectData(JSON.parse(text));
}

async function loadOrBuildMeta(id: string): Promise<StoredProjectMeta | null> {
  const cached = await get<StoredProjectMeta>(projectMetaKey(id));
  if (cached) return cached;

  const text = await loadStoredProjectText(id);
  if (!text) return null;
  try {
    const project = parseProjectData(JSON.parse(text));
    const meta = { ...buildStoredProjectMeta(project), savedAt: 0 };
    await set(projectMetaKey(id), meta);
    return meta;
  } catch {
    return null;
  }
}

/** Summaries for every project saved in this browser. */
export async function listStoredProjectSummaries(): Promise<
  StoredProjectSummary[]
> {
  const allKeys = await keys();
  const ids = new Set<string>();
  for (const key of allKeys) {
    if (typeof key !== "string") continue;
    const id = extractProjectIdFromKey(key);
    if (id) ids.add(id);
  }

  const summaries: StoredProjectSummary[] = [];
  for (const id of ids) {
    const meta = await loadOrBuildMeta(id);
    if (!meta) continue;
    summaries.push({ id, ...meta });
  }
  return summaries;
}

/** Remove a project and its stored waveform and version history from this browser. */
export async function deleteStoredProject(projectId: string): Promise<boolean> {
  const hadProject = !!(await loadStoredProjectText(projectId));
  if (!hadProject) return false;

  await Promise.all([
    del(projectKey(projectId)),
    del(projectMetaKey(projectId)),
    del(waveformKey(projectId)),
    clearProjectHistoryById(projectId),
  ]);

  const activeId = await getActiveProjectId();
  if (activeId === projectId) {
    await del(ACTIVE_PROJECT_KEY);
  }
  return true;
}

/** Write-once (or re-import) waveform peaks for a project. */
export async function saveStoredWaveform(
  projectId: string,
  entry: CachedWaveformPeaks,
): Promise<void> {
  await set(waveformKey(projectId), entry);
}

export async function loadStoredWaveform(
  projectId: string,
): Promise<CachedWaveformPeaks | undefined> {
  return get<CachedWaveformPeaks>(waveformKey(projectId));
}
