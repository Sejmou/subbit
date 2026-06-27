import type { Project } from "../types";
import { parseProjectData } from "./project-schema";
import {
  waveformBundleToFile,
  type ParsedProjectBundle,
} from "./project-bundle";
import { parseWaveformPeaksFile } from "./waveform-peaks";

/** Parse project JSON from a bundle; applies the current video filename. */
export function projectFromBundleText(
  projectText: string,
  videoFileName: string,
): Project {
  const project = parseProjectData(JSON.parse(projectText));
  return { ...project, videoName: videoFileName };
}

export async function parseWaveformFromBundle(
  waveform: NonNullable<ParsedProjectBundle["waveform"]>,
) {
  return parseWaveformPeaksFile(waveformBundleToFile(waveform));
}
