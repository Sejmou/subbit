import type { Cue, Project } from "../types";
import { cuePlainText } from "./export-text";
import { fileSecondsToSubtitleSeconds } from "./program-start";

/** SRT timestamp "HH:MM:SS,mmm" from subtitle seconds (from reference frame). */
function srtTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const s = Math.floor(total) % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function cueExportSeconds(
  cue: Cue,
  project: Project,
  boundary: "in" | "out",
): number {
  const fileSeconds = boundary === "in" ? cue.start : cue.end;
  return fileSecondsToSubtitleSeconds(
    fileSeconds,
    project.referenceStartSeconds,
  );
}

function cueText(cue: Cue): string {
  return cuePlainText(cue);
}

/** Export plain SRT for round-tripping in other subtitle tools. */
export function exportSrt(project: Project): string {
  return project.cues
    .map((cue, i) => {
      const text = cueText(cue);
      return `${i + 1}\n${srtTime(cueExportSeconds(cue, project, "in"))} --> ${srtTime(cueExportSeconds(cue, project, "out"))}\n${text}\n`;
    })
    .join("\n");
}
