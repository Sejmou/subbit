import { get, set, del } from "idb-keyval";
import type { Project, VideoIdentity } from "../types";
import { parseProjectData } from "./project-schema";

/**
 * File access layer. Prefers the File System Access API (Chrome/Edge) so the
 * project can be saved in place and the large movie handle re-opened next
 * session without re-picking. Falls back to download/upload elsewhere.
 */

// Minimal typings for the parts of the FS Access API we use (not yet in lib.dom).
type PermissionState = "granted" | "denied" | "prompt";
interface FsFileHandle {
  name: string;
  kind: "file";
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string | Blob): Promise<void>;
    close(): Promise<void>;
  }>;
  queryPermission?(opts: {
    mode: "read" | "readwrite";
  }): Promise<PermissionState>;
  requestPermission?(opts: {
    mode: "read" | "readwrite";
  }): Promise<PermissionState>;
}

interface FilePickerWindow {
  showOpenFilePicker?: (opts?: unknown) => Promise<FsFileHandle[]>;
  showSaveFilePicker?: (opts?: unknown) => Promise<FsFileHandle>;
}

const win = (): FilePickerWindow => window as unknown as FilePickerWindow;

export function isFsAccessSupported(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

export type { FsFileHandle };

const HANDLE_KEYS = {
  movie: "subbit:movieHandle",
  project: "subbit:projectHandle",
} as const;

/** Ensure we still have permission for a cached handle (may prompt). */
export async function ensurePermission(
  handle: FsFileHandle,
  mode: "read" | "readwrite",
): Promise<boolean> {
  const opts = { mode };
  if ((await handle.queryPermission?.(opts)) === "granted") return true;
  return (await handle.requestPermission?.(opts)) === "granted";
}

/** Silently check (no prompt) whether permission is already granted. */
export async function hasPermission(
  handle: FsFileHandle,
  mode: "read" | "readwrite",
): Promise<boolean> {
  return (await handle.queryPermission?.({ mode })) === "granted";
}

export async function pickFile(
  accept: Record<string, string[]>,
  description: string,
) {
  const handles = await win().showOpenFilePicker?.({
    multiple: false,
    types: [{ description, accept }],
  });
  return handles?.[0];
}

export async function pickProjectSaveFile(suggestedName: string) {
  return win().showSaveFilePicker?.({
    suggestedName,
    types: [
      {
        description: "Subbit project",
        accept: { "application/json": [".json"] },
      },
    ],
  });
}

export async function readHandleAsFile(handle: FsFileHandle): Promise<File> {
  return handle.getFile();
}

export async function writeTextToHandle(
  handle: FsFileHandle,
  text: string,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

// --- handle caching (so the 1.2 GB movie reopens without re-picking) ---

export async function cacheMovieHandle(handle: FsFileHandle) {
  await set(HANDLE_KEYS.movie, handle);
}
export async function getCachedMovieHandle(): Promise<
  FsFileHandle | undefined
> {
  return get(HANDLE_KEYS.movie);
}
export async function cacheProjectHandle(handle: FsFileHandle) {
  await set(HANDLE_KEYS.project, handle);
}
export async function getCachedProjectHandle(): Promise<
  FsFileHandle | undefined
> {
  return get(HANDLE_KEYS.project);
}
export async function clearCachedHandles() {
  await Promise.all([del(HANDLE_KEYS.movie), del(HANDLE_KEYS.project)]);
}

// --- download/upload fallback ---

export function downloadText(
  filename: string,
  text: string,
  mime = "text/plain",
) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- serialization ---

function normalizeVideoIdentityForSave(video: VideoIdentity): VideoIdentity {
  const out: VideoIdentity = { duration: video.duration };
  if (video.fileName) out.fileName = video.fileName;
  if (
    video.frameRateNumerator !== undefined &&
    video.frameRateDenominator !== undefined
  ) {
    out.frameRateNumerator = video.frameRateNumerator;
    out.frameRateDenominator = video.frameRateDenominator;
  }
  return out;
}

export function serializeProject(project: Project): string {
  const payload =
    project.video === undefined
      ? project
      : { ...project, video: normalizeVideoIdentityForSave(project.video) };
  return JSON.stringify(payload, null, 2);
}

export function parseProject(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "Could not parse file as JSON. Select a whisperx audio.json or a saved .subbit.json project file.",
    );
  }
  return parseProjectData(data);
}

export { parseProjectData, isSubbitProject } from "./project-schema";
