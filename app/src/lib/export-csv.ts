import { secondsToTimecode } from "./timecode";
import type { Cue, Project } from "../types";
import { fileTimeToProgramTime, contentStartSeconds } from "./program-start";

export type Delimiter = "\t" | ",";

const HEADER = [
  "No",
  "Timecode In",
  "Timecode Out",
  "Rolle",
  "Info",
  "Subtitle",
];

/** Join a cue's segments for the "Info" (shots) and "Subtitle" (texts) columns. */
function joinSegments(cue: Cue): { info: string; subtitle: string } {
  return {
    info: cue.segments.map((s) => s.shot).join(" / "),
    subtitle: cue.segments.map((s) => s.text.trim()).join(" / "),
  };
}

function roleName(project: Project, cue: Cue): string {
  if (!cue.speakerId) return "";
  const speaker = project.speakers.find((s) => s.id === cue.speakerId);
  return speaker?.name?.trim() || cue.speakerId;
}

/** Quote a field for comma-CSV per RFC 4180; tab output is left as-is. */
function escapeField(value: string, delimiter: Delimiter): string {
  if (delimiter === ",") {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
  // Tab-separated: strip tabs/newlines that would break the row.
  return value.replace(/[\t\r\n]+/g, " ");
}

/**
 * Build the delivery CSV/TSV. Each cue is one row with SMPTE timecodes
 * (project fps + offset) and " / "-joined shots/text for mixed-shot cues.
 */
export function exportCsv(
  project: Project,
  delimiter: Delimiter = "\t",
): string {
  const { fps, timecodeOffset } = project;
  const contentStart = contentStartSeconds(project);
  const rows: string[][] = [HEADER];

  project.cues.forEach((cue, i) => {
    const { info, subtitle } = joinSegments(cue);
    rows.push([
      String(i + 1),
      secondsToTimecode(
        fileTimeToProgramTime(cue.start, contentStart),
        fps,
        timecodeOffset,
      ),
      secondsToTimecode(
        fileTimeToProgramTime(cue.end, contentStart),
        fps,
        timecodeOffset,
      ),
      roleName(project, cue),
      info,
      subtitle,
    ]);
  });

  return rows
    .map((row) => row.map((f) => escapeField(f, delimiter)).join(delimiter))
    .join("\r\n");
}
