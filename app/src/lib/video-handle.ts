import { get, set, del } from "idb-keyval";
import type { Project } from "../types";
import {
  cacheVideoHandle,
  clearCachedVideoHandle,
  ensurePermission,
  getCachedVideoHandle,
  hasPermission,
  isFileHandlePermissionError,
  isFileHandleStaleError,
  readHandleAsFile,
  type FsFileHandle,
} from "./project-io";

const PROJECT_VIDEO_HANDLE_PREFIX = "subbit:projectVideoHandle:";

function projectVideoHandleKey(projectId: string): string {
  return `${PROJECT_VIDEO_HANDLE_PREFIX}${projectId}`;
}

/** True when the loaded file name differs from the project's stored video hint. */
export function videoFilenameDiffers(
  project: Project,
  fileName: string,
): boolean {
  return project.videoName.trim() !== fileName.trim();
}

export function formatVideoFilenameMismatch(
  project: Project,
  fileName: string,
): string {
  return `This project was created for “${project.videoName}”, but the video file is “${fileName}”. Timings are verified by duration and frame rate, not the filename.`;
}

/** Returns false when the handle is stale or unreadable without a user gesture. */
export async function verifyVideoHandle(
  handle: FsFileHandle,
): Promise<boolean> {
  if (!(await hasPermission(handle, "read"))) return false;
  try {
    await readHandleAsFile(handle);
    return true;
  } catch (err) {
    if (isFileHandleStaleError(err) || isFileHandlePermissionError(err)) {
      return false;
    }
    throw err;
  }
}

async function readVideoFromHandle(handle: FsFileHandle): Promise<File | null> {
  try {
    return await readHandleAsFile(handle);
  } catch (err) {
    if (isFileHandleStaleError(err) || isFileHandlePermissionError(err)) {
      return null;
    }
    throw err;
  }
}

export async function getCachedVideoHandleForProject(
  projectId: string,
): Promise<FsFileHandle | undefined> {
  const perProject = await get<FsFileHandle>(projectVideoHandleKey(projectId));
  if (perProject) return perProject;
  return getCachedVideoHandle();
}

export async function cacheVideoHandleForProject(
  projectId: string,
  handle: FsFileHandle,
): Promise<void> {
  await set(projectVideoHandleKey(projectId), handle);
  await cacheVideoHandle(handle);
}

export async function clearCachedVideoHandleForProject(
  projectId: string,
): Promise<void> {
  await del(projectVideoHandleKey(projectId));
  await clearCachedVideoHandle();
}

export interface ResolvedVideo {
  file: File;
  handle: FsFileHandle;
}

/**
 * Resolve a readable video file for a project: session handle → per-project cache
 * → global cache → optional picker. Clears stale handles and returns null when
 * the user must pick again or permission is denied.
 */
export async function resolveVideoForProject(
  project: Project,
  opts: {
    fsSupported: boolean;
    sessionHandle?: FsFileHandle | null;
    /** When true (user clicked Open/Restore), may prompt for read permission. */
    requestPermission?: boolean;
    pickVideo?: () => Promise<FsFileHandle | undefined>;
  },
): Promise<ResolvedVideo | null> {
  const tried = new Set<FsFileHandle>();
  const candidates: FsFileHandle[] = [];

  if (opts.sessionHandle) candidates.push(opts.sessionHandle);

  const cached = await getCachedVideoHandleForProject(project.id);
  if (cached) candidates.push(cached);

  for (const handle of candidates) {
    if (tried.has(handle)) continue;
    tried.add(handle);

    const mayPrompt =
      opts.requestPermission === true || opts.pickVideo !== undefined;
    if (mayPrompt) {
      if (!(await ensurePermission(handle, "read"))) continue;
    } else if (!(await hasPermission(handle, "read"))) {
      continue;
    }

    const file = await readVideoFromHandle(handle);
    if (!file) {
      await clearCachedVideoHandleForProject(project.id);
      continue;
    }
    return { file, handle };
  }

  if (!opts.fsSupported || !opts.pickVideo) return null;

  const picked = await opts.pickVideo();
  if (!picked) return null;

  await cacheVideoHandleForProject(project.id, picked);
  const file = await readHandleAsFile(picked);
  return { file, handle: picked };
}

/** Whether the last session can be restored (project + readable video handle). */
export async function canRestoreLastSession(
  projectId: string,
): Promise<boolean> {
  const handle = await getCachedVideoHandleForProject(projectId);
  if (!handle) return false;

  const permission = await handle.queryPermission?.({ mode: "read" });
  if (permission === "denied") return false;
  if (permission === "granted") return verifyVideoHandle(handle);
  // "prompt" — cached handle exists; Restore click can request permission.
  return true;
}
