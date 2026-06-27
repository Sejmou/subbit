import {
  DEFAULT_FPS,
  DEFAULT_SHOTS,
  DEFAULT_TIMECODE_OFFSET,
  PROJECT_VERSION,
  type Project,
} from "../types";
import { newProjectId, resolveProjectName } from "./project-meta";

/** Blank project for manual subtitle authoring (video loaded, no whisperx import). */
export function createEmptyProject(
  videoName: string,
  name?: string,
): Project {
  return {
    version: PROJECT_VERSION,
    id: newProjectId(),
    name: resolveProjectName(name ?? "", videoName),
    videoName,
    fps: DEFAULT_FPS,
    timecodeOffset: DEFAULT_TIMECODE_OFFSET,
    contentStartSeconds: 0,
    defaultShot: DEFAULT_SHOTS[0].id,
    shots: DEFAULT_SHOTS,
    speakers: [],
    cues: [],
  };
}
