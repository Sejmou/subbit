import type { DiarizedExportOptions } from "./export-format";
import type { Cue, Project, Speaker } from "../types";
import { cuePlainText, speakerForCue, speakerRoleName } from "./export-text";
import { fileSecondsToSubtitleSeconds } from "./program-start";

/** ASS timestamp H:MM:SS.cc (centiseconds). */
function assTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const cs = Math.round((total - Math.floor(total)) * 100);
  const s = Math.floor(total) % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
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

/** #RRGGBB → ASS &HAABBGGRR (alpha + BGR). */
export function hexToAssColor(hex: string): string {
  const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return "&H00FFFFFF";
  const n = Number.parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const pad = (v: number) => v.toString(16).padStart(2, "0").toUpperCase();
  return `&H00${pad(b)}${pad(g)}${pad(r)}`;
}

function assStyleName(speaker: Speaker, used: Set<string>): string {
  const base =
    (speaker.name.trim() || speaker.id)
      .replace(/[^a-zA-Z0-9_+-]/g, "_")
      .slice(0, 63) || "Speaker";
  let name = base;
  let n = 2;
  while (used.has(name)) {
    name = `${base}_${n}`;
    n += 1;
  }
  used.add(name);
  return name;
}

function assEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

const STYLE_FORMAT =
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding";

const EVENT_FORMAT =
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text";

function styleLine(name: string, color: string): string {
  return `Style: ${name},Arial,20,${color},&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,25,1`;
}

/** Export ASS/SSA with optional per-speaker colors and name labels. */
export function exportAss(
  project: Project,
  options: DiarizedExportOptions,
): string {
  const { speakerLabels, speakerColors } = options;
  const usedNames = new Set<string>(["Default"]);
  const styleBySpeakerId = new Map<string, string>();

  const styleLines = [styleLine("Default", "&H00FFFFFF")];
  if (speakerColors) {
    for (const speaker of project.speakers) {
      const name = assStyleName(speaker, usedNames);
      styleBySpeakerId.set(speaker.id, name);
      styleLines.push(styleLine(name, hexToAssColor(speaker.color)));
    }
  }

  const dialogues = project.cues.map((cue) => {
    const text = assEscape(cuePlainText(cue));
    const speaker = speakerForCue(project, cue);
    const style =
      speakerColors && speaker
        ? (styleBySpeakerId.get(speaker.id) ?? "Default")
        : "Default";
    const name = speakerLabels && speaker ? speakerRoleName(project, cue) : "";
    return `Dialogue: 0,${assTime(cueExportSeconds(cue, project, "in"))},${assTime(cueExportSeconds(cue, project, "out"))},${style},${name},0,0,0,,${text}`;
  });

  return [
    "[Script Info]",
    `Title: ${project.name}`,
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: None",
    "",
    "[V4+ Styles]",
    STYLE_FORMAT,
    ...styleLines,
    "",
    "[Events]",
    EVENT_FORMAT,
    ...dialogues,
    "",
  ].join("\n");
}
