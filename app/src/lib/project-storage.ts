import { get, set } from "idb-keyval";
import type { Project } from "../types";
import { parseProjectData } from "./project-schema";
import type { CachedWaveformPeaks } from "./waveform-cache";

const ACTIVE_PROJECT_KEY = "subbit:activeProjectId";

function projectKey(id: string): string {
  return `subbit:project:${id}`;
}

function waveformKey(id: string): string {
  return `subbit:project:${id}:waveform`;
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
  await set(projectKey(project.id), text);
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
