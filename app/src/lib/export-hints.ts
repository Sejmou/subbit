import type { ExportFormatInfo } from "./export-format";
import type { Project } from "../types";
import {
  fileSecondsToSubtitleTimecode,
  nominalTimecodeFps,
  projectFrameRate,
  totalFramesToTimecode,
} from "./frame-time";
import { cueExportFrame, referenceStartTimecode } from "./program-start";

const REFERENCE_START_BASE =
  "Reference start skips leader/black at the head of the file. Cue In/Out in the editor use subtitle SMPTE; export subtracts the reference point.";

export function exportFormatHint(
  info: ExportFormatInfo,
  project: Project,
): string {
  const parts = [info.hint];
  const ref = project.referenceStartSeconds;

  if (ref > 0) {
    const skip = referenceStartTimecode(project);
    parts.push(
      `Reference start is set at ${skip}; export times count from subtitle zero.`,
    );
  } else {
    parts.push(
      "No reference start set — export times match subtitle SMPTE from the project start timecode.",
    );
  }

  if (info.usesDeliveryOffset) {
    parts.push(
      "Delivery SMPTE uses the project start timecode at the reference point.",
    );
  } else {
    parts.push(
      "Export uses subtitle-relative time from 00:00:00 (no broadcast offset in this format).",
    );
  }

  parts.push(REFERENCE_START_BASE);
  return parts.join(" ");
}

/** One-line summary for the export preview block. */
export function exportPreviewSummary(
  project: Project,
  inSeconds: number,
  outSeconds: number,
  usesDeliveryOffset: boolean,
): {
  subtitleIn: string;
  subtitleOut: string;
  deliveryIn?: string;
  deliveryOut?: string;
} {
  const tcFps = nominalTimecodeFps(projectFrameRate(project));
  const exportIn = cueExportFrame(inSeconds, project);
  const exportOut = cueExportFrame(outSeconds, project);
  const subtitleIn = totalFramesToTimecode(exportIn, tcFps);
  const subtitleOut = totalFramesToTimecode(exportOut, tcFps);

  if (!usesDeliveryOffset) {
    return { subtitleIn, subtitleOut };
  }

  return {
    subtitleIn,
    subtitleOut,
    deliveryIn: fileSecondsToSubtitleTimecode(inSeconds, project),
    deliveryOut: fileSecondsToSubtitleTimecode(outSeconds, project),
  };
}
