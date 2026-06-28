import { get, set, del } from "idb-keyval";
import type { Project } from "../types";
import {
  cacheVideoHandle,
  clearCachedVideoHandle,
  ensurePermission,
  getCachedVideoHandle,
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

/** Returns false when the handle is stale (moved, renamed, deleted). Rethrows other errors. */
export async function verifyVideoHandle(
  handle: FsFileHandle,
): Promise<boolean> {
  try {
    await readHandleAsFile(handle);
    return true;
  } catch (err) {
    if (isFileHandleStaleError(err)) return false;
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

    if (!(await verifyVideoHandle(handle))) {
      await clearCachedVideoHandleForProject(project.id);
      continue;
    }

    if (!(await ensurePermission(handle, "read"))) return null;

    try {
      const file = await readHandleAsFile(handle);
      return { file, handle };
    } catch (err) {
      if (isFileHandleStaleError(err)) {
        await clearCachedVideoHandleForProject(project.id);
        continue;
      }
      throw err;
    }
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
  if (!(await verifyVideoHandle(handle))) {
    await clearCachedVideoHandleForProject(projectId);
    return false;
  }
  return true;
}
