import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { WaveformPeaksInput } from "./waveform-peaks";

export const BUNDLE_PROJECT_JSON = "project.json";
export const BUNDLE_WAVEFORM_DAT = "waveform.dat";
export const BUNDLE_WAVEFORM_JSON = "waveform.json";

export interface ProjectBundleWaveform {
  fileName: string;
  bytes: Uint8Array;
}

export interface ParsedProjectBundle {
  projectText: string;
  waveform?: ProjectBundleWaveform;
}

export function waveformInputToBundleFile(
  input: WaveformPeaksInput,
): ProjectBundleWaveform {
  if (input.kind === "dat") {
    return {
      fileName: BUNDLE_WAVEFORM_DAT,
      bytes: new Uint8Array(input.arrayBuffer),
    };
  }
  return {
    fileName: BUNDLE_WAVEFORM_JSON,
    bytes: strToU8(JSON.stringify(input.json)),
  };
}

export function buildProjectBundleZip(
  projectText: string,
  waveform?: ProjectBundleWaveform,
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    [BUNDLE_PROJECT_JSON]: strToU8(projectText),
  };
  if (waveform) files[waveform.fileName] = waveform.bytes;
  return zipSync(files);
}

function findWaveformEntry(
  files: Record<string, Uint8Array>,
): ProjectBundleWaveform | undefined {
  for (const name of [BUNDLE_WAVEFORM_DAT, BUNDLE_WAVEFORM_JSON]) {
    const bytes = files[name];
    if (bytes) return { fileName: name, bytes };
  }
  for (const [name, bytes] of Object.entries(files)) {
    const lower = name.toLowerCase();
    if (lower.endsWith(".dat") || lower.endsWith(".waveform.json")) {
      return { fileName: name.split("/").pop() ?? name, bytes };
    }
  }
  return undefined;
}

export function parseProjectBundleZip(data: Uint8Array): ParsedProjectBundle {
  const files = unzipSync(data);
  const projectBytes =
    files[BUNDLE_PROJECT_JSON] ??
    Object.entries(files).find(([name]) =>
      name.toLowerCase().endsWith(".subbit.json"),
    )?.[1] ??
    Object.entries(files).find(([name]) => name.toLowerCase().endsWith(".json"))
      ?.[1];

  if (!projectBytes) {
    throw new Error(
      "Zip does not contain project.json (or another .json project file).",
    );
  }

  return {
    projectText: strFromU8(projectBytes),
    waveform: findWaveformEntry(files),
  };
}

/** Turn bundle waveform bytes into a File for the existing peaks parser. */
export function waveformBundleToFile(waveform: ProjectBundleWaveform): File {
  const copy = new Uint8Array(waveform.bytes);
  const blob = new Blob([copy], {
    type: waveform.fileName.endsWith(".dat")
      ? "application/octet-stream"
      : "application/json",
  });
  return new File([blob], waveform.fileName);
}
