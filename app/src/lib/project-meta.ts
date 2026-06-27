import type { Project } from "../types";

export function newProjectId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** Default name when the user leaves the project name blank. */
export function fallbackProjectName(videoName: string): string {
  const trimmed = videoName.trim();
  return trimmed || "Untitled";
}

/** Trim user input; fall back to the source video filename. */
export function resolveProjectName(name: string, videoName: string): string {
  return name.trim() || fallbackProjectName(videoName);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").trim() || "project";
}

export function suggestedProjectFilename(project: Project): string {
  return `${sanitizeFilename(resolveProjectName(project.name, project.videoName))}.subbit.json`;
}

export function suggestedExportFilename(
  project: Project,
  ext: string,
): string {
  return `${sanitizeFilename(resolveProjectName(project.name, project.videoName))}.${ext}`;
}
