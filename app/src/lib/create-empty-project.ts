import {
  DEFAULT_FPS_DENOMINATOR,
  DEFAULT_FPS_NUMERATOR,
  DEFAULT_SHOTS,
  DEFAULT_START_TIMECODE,
  PROJECT_VERSION,
  type Project,
} from "../types";
import { newProjectId, resolveProjectName } from "./project-meta";

/** Blank project for manual subtitle authoring (video loaded, no whisperx import). */
export function createEmptyProject(videoName: string, name?: string): Project {
  return {
    version: PROJECT_VERSION,
    id: newProjectId(),
    name: resolveProjectName(name ?? "", videoName),
    videoName,
    fpsNumerator: DEFAULT_FPS_NUMERATOR,
    fpsDenominator: DEFAULT_FPS_DENOMINATOR,
    startTimecode: DEFAULT_START_TIMECODE,
    referenceStartSeconds: 0,
    defaultShot: DEFAULT_SHOTS[0].id,
    shots: DEFAULT_SHOTS,
    speakers: [],
    cues: [],
  };
}
