import { parseClockTimestamp } from "./parse-subtitle-time";
import type { SubtitleBlock } from "./subtitle-blocks";

/** Parse SubRip (.srt) text into subtitle blocks. */
export function parseSrt(text: string): SubtitleBlock[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  const blocks: SubtitleBlock[] = [];
  for (const chunk of normalized.split(/\n\n+/)) {
    const lines = chunk.split("\n").filter((line) => line.length > 0);
    if (lines.length < 2) continue;

    let timeLineIndex = 0;
    if (/^\d+$/.test(lines[0]!.trim()) && lines.length >= 3) {
      timeLineIndex = 1;
    }

    const timeLine = lines[timeLineIndex]!;
    const timing = timeLine.match(/^(.+?)\s*-->\s*(.+)$/);
    if (!timing) continue;

    const start = parseClockTimestamp(timing[1]!);
    const end = parseClockTimestamp(timing[2]!);
    const body = lines
      .slice(timeLineIndex + 1)
      .join("\n")
      .trim();
    if (!body) continue;

    blocks.push({ start, end, text: body });
  }

  if (blocks.length === 0) {
    throw new Error("No SRT cues found");
  }
  return blocks;
}
