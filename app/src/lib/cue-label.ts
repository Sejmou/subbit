import type { Cue } from "../types";
import { cueDisplayText } from "./word-model/render";

/** Plain subtitle text for timeline labels and exports. */
export function cueLabelText(cue: Cue): string {
  return cueDisplayText(cue).replace(/\n/g, " ").trim();
}

/** Truncate for narrow timeline overlays. */
export function cueLabelTextShort(cue: Cue, maxLen = 80): string {
  const text = cueLabelText(cue);
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}
