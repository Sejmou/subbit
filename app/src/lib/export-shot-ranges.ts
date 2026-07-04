import type { Cue } from "../types";
import { cueDisplayText } from "./word-model/render";

/**
 * Split cues into runs. A new run starts at each cue whose `joinedToPrev` is
 * falsy; cues with `joinedToPrev: true` append to the current run. Each run
 * maps to one delivery-sheet row (its cues are the " / " slices).
 */
export function groupCuesIntoRuns(cues: Cue[]): Cue[][] {
  const runs: Cue[][] = [];
  for (const cue of cues) {
    const current = runs[runs.length - 1];
    if (cue.joinedToPrev && current) {
      current.push(cue);
    } else {
      runs.push([cue]);
    }
  }
  return runs;
}

/** Join a run's cues into CSV "Info" (shots) and "Subtitle" (text) columns. */
export function joinRun(run: Cue[]): { info: string; subtitle: string } {
  return {
    info: run.map((c) => c.shot).join(" / "),
    subtitle: run.map((c) => cueDisplayText(c).trim()).join(" / "),
  };
}
