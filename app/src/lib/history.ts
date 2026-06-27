import { get, set, del, keys } from "idb-keyval";
import type { Project } from "../types";

/**
 * Persisted version history. Unlike the in-memory undo stack (store/project.ts),
 * these snapshots survive reloads and let the user roll back to an earlier saved
 * state. Stored in IndexedDB (via idb-keyval): a lightweight metadata list per
 * project plus one blob (the serialized JSON) per version, so listing the
 * history doesn't have to load every full snapshot into memory.
 */

export interface VersionMeta {
  id: string;
  createdAt: number;
  /** Optional user-given name for a manual snapshot. */
  label?: string;
  /** True if captured by an autosave rather than an explicit user action. */
  auto: boolean;
  /** Cheap content fingerprint, used to skip duplicate consecutive snapshots. */
  hash: string;
  cueCount: number;
  reviewedCount: number;
  /** Size of the serialized JSON in bytes. */
  size: number;
}

/** Keep at most this many versions per project; older ones are pruned. */
const MAX_VERSIONS = 60;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** Stable project identity so version history survives reloads. */
export function projectKey(project: Project): string {
  return `subbit:history:${project.id}`;
}

function blobKey(pk: string, id: string): string {
  return `${pk}:v:${id}`;
}

/** Fast 32-bit FNV-1a hash, hex-encoded. Good enough to dedupe identical saves. */
function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export async function listVersions(project: Project): Promise<VersionMeta[]> {
  return (await get<VersionMeta[]>(projectKey(project))) ?? [];
}

/**
 * Capture a snapshot of `project` (already serialized as `text`).
 * Returns the updated metadata list. Consecutive identical-content snapshots are
 * skipped unless a `label` is given (an explicit, intentional snapshot).
 */
export async function addVersion(
  project: Project,
  text: string,
  opts: { label?: string; auto?: boolean } = {},
): Promise<VersionMeta[]> {
  const pk = projectKey(project);
  const existing = (await get<VersionMeta[]>(pk)) ?? [];
  const hash = hashText(text);

  if (!opts.label && existing[0]?.hash === hash) return existing;

  const meta: VersionMeta = {
    id: newId(),
    createdAt: Date.now(),
    label: opts.label,
    auto: opts.auto ?? false,
    hash,
    cueCount: project.cues.length,
    reviewedCount: project.cues.filter((c) => c.reviewed).length,
    size: text.length,
  };

  await set(blobKey(pk, meta.id), text);

  const next = [meta, ...existing];
  const pruned = next.slice(MAX_VERSIONS);
  await Promise.all(pruned.map((v) => del(blobKey(pk, v.id))));
  const kept = next.slice(0, MAX_VERSIONS);
  await set(pk, kept);
  return kept;
}

/** The serialized JSON for a version, or undefined if it was pruned/missing. */
export async function getVersionText(
  project: Project,
  id: string,
): Promise<string | undefined> {
  return get<string>(blobKey(projectKey(project), id));
}

export async function deleteVersion(
  project: Project,
  id: string,
): Promise<VersionMeta[]> {
  const pk = projectKey(project);
  const existing = (await get<VersionMeta[]>(pk)) ?? [];
  const next = existing.filter((v) => v.id !== id);
  await del(blobKey(pk, id));
  await set(pk, next);
  return next;
}

/** Remove a project's entire history (metadata list + all version blobs). */
export async function clearVersions(project: Project): Promise<void> {
  const pk = projectKey(project);
  const all = await keys();
  await Promise.all(
    all
      .filter(
        (k) => typeof k === "string" && (k === pk || k.startsWith(`${pk}:v:`)),
      )
      .map((k) => del(k)),
  );
}
