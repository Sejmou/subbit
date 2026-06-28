import { get, set, del } from "idb-keyval";
import type { Project, VideoIdentity } from "../types";
import { parseProjectData } from "./project-schema";

/**
 * File access layer. Prefers the File System Access API (Chrome/Edge) so the
 * project can be saved in place and the large video handle re-opened next
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

/** True when the user dismissed a native file/save picker (not an app error). */
export function isFilePickerAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  if (
    err instanceof Error &&
    /aborted a request|user aborted/i.test(err.message)
  ) {
    return true;
  }
  return false;
}

async function ignorePickerAbort<T>(
  promise: Promise<T>,
): Promise<T | undefined> {
  try {
    return await promise;
  } catch (err) {
    if (isFilePickerAbortError(err)) return undefined;
    throw err;
  }
}

export type { FsFileHandle };

const HANDLE_KEYS = {
  video: "subbit:videoHandle",
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
  const picker = win().showOpenFilePicker?.({
    multiple: false,
    types: [{ description, accept }],
  });
  if (!picker) return undefined;
  const handles = await ignorePickerAbort(picker);
  return handles?.[0];
}

/** MIME map from FS Access `accept` to an HTML `<input accept>` string. */
export function acceptRecordToInputAccept(
  accept: Record<string, string[]>,
): string {
  const parts = new Set<string>();
  for (const [mime, exts] of Object.entries(accept)) {
    parts.add(mime);
    for (const ext of exts) {
      parts.add(ext.startsWith(".") ? ext : `.${ext}`);
    }
  }
  return [...parts].join(",");
}

function pickFileViaInput(accept: string): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.hidden = true;

    let settled = false;
    const settle = (file: File | undefined) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onWindowFocus);
      input.remove();
      resolve(file);
    };

    input.addEventListener("change", () => {
      settle(input.files?.[0]);
    });
    input.addEventListener("cancel", () => {
      settle(undefined);
    });

    const onWindowFocus = () => {
      window.setTimeout(() => {
        if (!settled && !input.files?.length) settle(undefined);
      }, 500);
    };

    document.body.appendChild(input);
    window.addEventListener("focus", onWindowFocus);
    input.click();
  });
}

/** Pick a file for one-off reads; falls back to `<input type="file">` outside Chromium. */
export async function pickFileAsFile(
  accept: Record<string, string[]>,
  description: string,
): Promise<File | undefined> {
  const handle = await pickFile(accept, description);
  if (handle) return readHandleAsFile(handle);
  if (isFsAccessSupported()) return undefined;
  return pickFileViaInput(acceptRecordToInputAccept(accept));
}

export async function pickProjectSaveFile(suggestedName: string) {
  const picker = win().showSaveFilePicker?.({
    suggestedName,
    types: [
      {
        description: "Subbit project",
        accept: { "application/json": [".json"] },
      },
    ],
  });
  if (!picker) return undefined;
  return ignorePickerAbort(picker);
}

export async function readHandleAsFile(handle: FsFileHandle): Promise<File> {
  return handle.getFile();
}

/** True when a cached FS handle no longer resolves (moved, renamed, deleted). */
export function isFileHandleStaleError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "NotFoundError") return true;
  if (err instanceof Error && err.name === "NotFoundError") return true;
  return false;
}

export async function writeTextToHandle(
  handle: FsFileHandle,
  text: string,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

// --- handle caching (so the 1.2 GB video reopens without re-picking) ---

export async function cacheVideoHandle(handle: FsFileHandle) {
  await set(HANDLE_KEYS.video, handle);
}
const LEGACY_VIDEO_HANDLE_KEY = "subbit:movieHandle";

export async function clearCachedVideoHandle(): Promise<void> {
  await Promise.all([del(HANDLE_KEYS.video), del(LEGACY_VIDEO_HANDLE_KEY)]);
}

export async function getCachedVideoHandle(): Promise<
  FsFileHandle | undefined
> {
  const handle = await get(HANDLE_KEYS.video);
  if (handle) return handle;
  return get(LEGACY_VIDEO_HANDLE_KEY);
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
  await clearCachedVideoHandle();
  await del(HANDLE_KEYS.project);
}

// --- download/upload fallback ---

export function downloadText(
  filename: string,
  text: string,
  mime = "text/plain",
) {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export function downloadBlob(filename: string, blob: Blob) {
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
  if (video.fileSize != null && video.fileSize > 0) {
    out.fileSize = video.fileSize;
  }
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
