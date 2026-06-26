import {
  DEFAULT_FPS,
  DEFAULT_SHOTS,
  DEFAULT_TIMECODE_OFFSET,
  PROJECT_VERSION,
  type Project,
} from '../types'

/** Blank project for manual subtitle authoring (movie loaded, no whisperx import). */
export function createEmptyProject(videoName: string): Project {
  return {
    version: PROJECT_VERSION,
    videoName,
    fps: DEFAULT_FPS,
    timecodeOffset: DEFAULT_TIMECODE_OFFSET,
    contentStartSeconds: 0,
    defaultShot: DEFAULT_SHOTS[0].id,
    shots: DEFAULT_SHOTS,
    speakers: [],
    cues: [],
  }
}
