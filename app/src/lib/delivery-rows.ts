import type { Cue, Project, ShotId, Speaker } from "../types";
import {
  nominalTimecodeFps,
  projectFrameRate,
  subtitleTimecodeToFileSeconds,
  timecodeToTotalFrames,
  totalFramesToTimecode,
} from "./frame-time";
import { extractSmpteTimecode } from "./timecode";
import {
  DEFAULT_DELIVERY_COLUMNS,
  type DeliveryColumnMapping,
} from "./delivery-columns";
import { groupCuesIntoRuns, joinRun } from "./export-shot-ranges";
import { cueExportFrame } from "./program-start";
import { parseEditableText } from "./word-model/tokenize";
import {
  requiredDuration,
  respreadCharacterWeighted,
} from "./word-model/timing";

export interface DeliveryRowValues {
  no: string;
  timecodeIn: string;
  timecodeOut: string;
  role: string;
  info: string;
  subtitle: string;
}

const SPEAKER_PALETTE = [
  "#e6194b",
  "#3cb44b",
  "#4363d8",
  "#f58231",
  "#911eb4",
  "#46f0f0",
  "#f032e6",
  "#bcf60c",
  "#fabebe",
  "#008080",
  "#9a6324",
  "#fffac8",
  "#800000",
  "#aaffc3",
  "#808000",
  "#ffd8b1",
  "#000075",
  "#a9a9a9",
];

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function roleName(project: Project, cue: Cue): string {
  if (!cue.speakerId) return "";
  const speaker = project.speakers.find((s) => s.id === cue.speakerId);
  return speaker?.name?.trim() || cue.speakerId;
}

/** Delivery SMPTE: start timecode + subtitle-relative cue time (clamped at zero). */
function cueDeliveryTimecode(fileSeconds: number, project: Project): string {
  const rate = projectFrameRate(project);
  const tcFps = nominalTimecodeFps(rate);
  const startFrames = timecodeToTotalFrames(project.startTimecode, tcFps);
  return totalFramesToTimecode(
    startFrames + cueExportFrame(fileSeconds, project),
    tcFps,
  );
}

/** Split delivery "Info" / "Subtitle" multi-shot values. */
export function splitDeliverySlices(value: string): string[] {
  if (!value.trim()) return [];
  return value.split(" / ");
}

/** Build spreadsheet rows (header + one row per run of joined cues). */
export function buildDeliveryRows(
  project: Project,
  columns: DeliveryColumnMapping = DEFAULT_DELIVERY_COLUMNS,
): string[][] {
  const header = [
    columns.no,
    columns.timecodeIn,
    columns.timecodeOut,
    columns.role,
    columns.info,
    columns.subtitle,
  ];
  const rows: string[][] = [header];

  groupCuesIntoRuns(project.cues).forEach((run, i) => {
    const first = run[0]!;
    const last = run[run.length - 1]!;
    const { info, subtitle } = joinRun(run);
    rows.push([
      String(i + 1),
      cueDeliveryTimecode(first.start, project),
      cueDeliveryTimecode(last.end, project),
      roleName(project, first),
      info,
      subtitle,
    ]);
  });

  return rows;
}

function normalizeShotSlices(
  info: string,
  subtitle: string,
  defaultShot: ShotId,
): { shotLabels: string[]; textSlices: string[] } {
  const textSlices = splitDeliverySlices(subtitle);
  if (textSlices.length === 0) {
    return { shotLabels: [defaultShot], textSlices: [""] };
  }

  let shotLabels = splitDeliverySlices(info);
  if (shotLabels.length === 0) {
    shotLabels = textSlices.map(() => defaultShot);
  } else if (shotLabels.length === 1 && textSlices.length > 1) {
    shotLabels = textSlices.map(() => shotLabels[0]!);
  } else if (shotLabels.length !== textSlices.length) {
    const last = shotLabels[shotLabels.length - 1] ?? defaultShot;
    while (shotLabels.length < textSlices.length) shotLabels.push(last);
    shotLabels = shotLabels.slice(0, textSlices.length);
  }

  return { shotLabels, textSlices };
}

/**
 * Build one cue per non-empty " / " slice as a run: words are spread
 * character-weighted across the whole row's [start, end] (so timing matches a
 * single-cue layout), then sliced into abutting cues. The speaker is assigned
 * to the first cue only; the rest are `joinedToPrev: true`.
 */
function buildRowCues(
  textSlices: string[],
  shotLabels: string[],
  start: number,
  end: number,
  speakerId: string | null,
): Cue[] {
  const slices = textSlices
    .map((text, i) => {
      const { tokens, lineBreakAfterWordIndices } = parseEditableText(
        text ?? "",
      );
      return {
        tokens,
        breaks: lineBreakAfterWordIndices,
        shot: shotLabels[i] ?? shotLabels[shotLabels.length - 1] ?? "ON",
      };
    })
    .filter((s) => s.tokens.length > 0);

  if (slices.length === 0) return [];

  const words = respreadCharacterWeighted(
    slices.flatMap((s) => s.tokens).map((text) => ({ text, start, end })),
    start,
    end,
  );

  const cues: Cue[] = [];
  let offset = 0;
  let prevEnd = start;
  slices.forEach((slice, i) => {
    const sliceWords = words.slice(offset, offset + slice.tokens.length);
    offset += slice.tokens.length;
    const cueStart = prevEnd;
    const natural =
      i === slices.length - 1 ? end : (sliceWords.at(-1)?.end ?? cueStart);
    const cueEnd = natural > cueStart ? natural : cueStart + 1e-3;
    prevEnd = cueEnd;
    cues.push({
      id: newId(),
      start: cueStart,
      end: cueEnd,
      speakerId: i === 0 ? speakerId : null,
      words: sliceWords,
      lineBreakAfterWordIndices: slice.breaks,
      shot: slice.shot,
      reviewed: false,
      inferredSpeaker: null,
      ...(i === 0 ? {} : { joinedToPrev: true }),
    });
  });
  return cues;
}

function resolveSpeakerId(
  roleNameValue: string,
  speakers: Speaker[],
): { speakerId: string | null; speakers: Speaker[] } {
  const trimmed = roleNameValue.trim();
  if (!trimmed) return { speakerId: null, speakers };

  const existing = speakers.find(
    (s) => s.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing) return { speakerId: existing.id, speakers };

  const speaker: Speaker = {
    id: newId(),
    name: trimmed,
    color: SPEAKER_PALETTE[speakers.length % SPEAKER_PALETTE.length],
  };
  return { speakerId: speaker.id, speakers: [...speakers, speaker] };
}

function parseDeliveryTimecode(
  tc: string,
  project: Project,
): number | undefined {
  const trimmed = tc.trim();
  if (!trimmed) return undefined;
  const smpte = extractSmpteTimecode(trimmed);
  if (!smpte) return undefined;
  try {
    return subtitleTimecodeToFileSeconds(smpte, project);
  } catch {
    return undefined;
  }
}

function estimateEnd(start: number, subtitle: string): number {
  return start + Math.max(requiredDuration(subtitle), 0.5);
}

/** Convert parsed spreadsheet rows into cues, merging speakers into the project. */
export function cuesFromDeliveryRows(
  project: Project,
  rows: DeliveryRowValues[],
): { cues: Cue[]; speakers: Speaker[] } {
  let speakers = [...project.speakers];
  const cues: Cue[] = [];
  let chainStart = project.referenceStartSeconds;

  for (const row of rows) {
    const subtitle = row.subtitle.trim();
    if (!subtitle) continue;

    const startParsed = parseDeliveryTimecode(row.timecodeIn, project);
    const endParsed = parseDeliveryTimecode(row.timecodeOut, project);

    let start: number;
    let end: number;

    if (startParsed === undefined && endParsed === undefined) {
      start = chainStart;
      end = estimateEnd(start, subtitle);
    } else if (startParsed !== undefined && endParsed === undefined) {
      start = startParsed;
      end = estimateEnd(start, subtitle);
    } else if (startParsed === undefined && endParsed !== undefined) {
      start = Math.max(project.referenceStartSeconds, endParsed - 0.5);
      end = endParsed;
    } else {
      start = startParsed!;
      end = endParsed!;
    }

    if (end <= start) end = estimateEnd(start, subtitle);
    chainStart = end;

    const { shotLabels, textSlices } = normalizeShotSlices(
      row.info,
      subtitle,
      project.defaultShot,
    );
    const { speakerId, speakers: nextSpeakers } = resolveSpeakerId(
      row.role,
      speakers,
    );
    speakers = nextSpeakers;

    cues.push(...buildRowCues(textSlices, shotLabels, start, end, speakerId));
  }

  return { cues, speakers };
}

/** Replace project cues/speakers from delivery spreadsheet rows. */
export function applyDeliveryImport(
  project: Project,
  rows: DeliveryRowValues[],
): Project {
  const { cues, speakers } = cuesFromDeliveryRows(project, rows);
  return { ...project, cues, speakers };
}
