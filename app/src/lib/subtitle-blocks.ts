import type { Cue, Project, Speaker } from "../types";
import { wordsFromDeliveryText } from "./delivery-rows";

export interface SubtitleBlock {
  /** Subtitle-relative seconds (from reference frame). */
  start: number;
  end: number;
  text: string;
  speakerName?: string;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
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

/** Map parsed subtitle blocks into project cues (file-relative timing). */
export function cuesFromSubtitleBlocks(
  project: Project,
  blocks: SubtitleBlock[],
): { cues: Cue[]; speakers: Speaker[] } {
  let speakers = [...project.speakers];
  const cues: Cue[] = [];
  const ref = project.referenceStartSeconds;

  for (const block of blocks) {
    const text = block.text.trim();
    if (!text) continue;

    const start = ref + block.start;
    let end = ref + block.end;
    if (end <= start) end = start + 0.5;

    const { speakerId, speakers: nextSpeakers } = resolveSpeakerId(
      block.speakerName ?? "",
      speakers,
    );
    speakers = nextSpeakers;

    const content = wordsFromDeliveryText(
      [text],
      [project.defaultShot],
      start,
      end,
    );

    cues.push({
      id: newId(),
      start,
      end,
      speakerId,
      reviewed: false,
      inferredSpeaker: null,
      ...content,
    });
  }

  return { cues, speakers };
}

/** Replace project cues/speakers from parsed subtitle blocks. */
export function applySubtitleImport(
  project: Project,
  blocks: SubtitleBlock[],
): Project {
  const { cues, speakers } = cuesFromSubtitleBlocks(project, blocks);
  if (cues.length === 0) {
    throw new Error("No subtitle cues found to import");
  }
  return { ...project, cues, speakers };
}
