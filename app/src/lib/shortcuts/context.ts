import type { Cue, Project } from "../../types";
import { frameDuration } from "../timecode";
import { usePlayback } from "../../store/playback";
import { useProject } from "../../store/project";

export type ProjectState = ReturnType<typeof useProject.getState>;
export type PlaybackState = ReturnType<typeof usePlayback.getState>;

export interface Caret {
  cueId: string;
  segIndex: number;
  offset: number;
}

export interface ShortcutContext {
  editing: boolean;
  target: EventTarget | null;
  project: Project | null;
  cue: Cue | null;
  cueIndex: number;
  frame: number;
  caret: Caret | null;
  ps: ProjectState;
  pb: PlaybackState;
}

export function isEditing(
  target: EventTarget | null,
): target is HTMLTextAreaElement | HTMLInputElement {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT");
}

export function activeCaret(): Caret | null {
  const el = document.activeElement as HTMLTextAreaElement | null;
  if (!el || el.tagName !== "TEXTAREA" || !el.dataset.cueId) return null;
  return {
    cueId: el.dataset.cueId,
    segIndex: Number(el.dataset.segIndex ?? 0),
    offset: el.selectionStart ?? el.value.length,
  };
}

export function buildShortcutContext(
  target: EventTarget | null,
): ShortcutContext {
  const ps = useProject.getState();
  const pb = usePlayback.getState();
  const editing = isEditing(target);
  const project = ps.project;
  const cueId = ps.selectedCueId;
  const cue =
    project && cueId
      ? (project.cues.find((c) => c.id === cueId) ?? null)
      : null;
  const cueIndex =
    project && cue ? project.cues.findIndex((c) => c.id === cue.id) : -1;

  return {
    editing,
    target,
    project,
    cue,
    cueIndex,
    frame: project ? frameDuration(project.fps) : 0,
    caret: activeCaret(),
    ps,
    pb,
  };
}
