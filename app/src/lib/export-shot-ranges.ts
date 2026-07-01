import type { Cue } from "../types";
import { renderShotSlice } from "./word-model/render";

/** Join a cue's shot ranges for CSV "Info" and "Subtitle" columns. */
export function joinShotRanges(cue: Cue): { info: string; subtitle: string } {
  return {
    info: cue.shotRanges.map((r) => r.shot).join(" / "),
    subtitle: cue.shotRanges
      .map((r) =>
        renderShotSlice(
          cue.words,
          cue.lineBreakAfterWordIndices,
          r.fromWord,
          r.toWord,
        ).trim(),
      )
      .join(" / "),
  };
}
