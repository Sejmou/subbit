import { parseClockTimestamp } from "./parse-subtitle-time";
import type { SubtitleBlock } from "./subtitle-blocks";

function unescapeVttText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripVttMarkup(text: string): { text: string; speakerName?: string } {
  let body = text.trim();
  let speakerName: string | undefined;

  const voice = body.match(/^<v\s+([^>]+)>(.*)$/s);
  if (voice) {
    speakerName = voice[1]!.trim();
    body = voice[2]!;
  }

  body = body.replace(/<c\.[^>]+>/g, "").replace(/<\/c>/g, "");
  body = body.replace(/<[^>]+>/g, "");
  return { text: unescapeVttText(body).trim(), speakerName };
}

/** Parse WebVTT (.vtt) text into subtitle blocks. */
export function parseVtt(text: string): SubtitleBlock[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = normalized.trim();
  if (!trimmed.toUpperCase().startsWith("WEBVTT")) {
    throw new Error("Expected a WebVTT file (must start with WEBVTT)");
  }

  const withoutHeader = trimmed.replace(/^WEBVTT[^\n]*\n*/, "").trim();
  const noStyles = withoutHeader.replace(
    /(?:^|\n)STYLE\n[\s\S]*?(?=\n\n|\n\d|\n*$)/g,
    "\n",
  );
  const noNotes = noStyles.replace(
    /(?:^|\n)NOTE[^\n]*\n[\s\S]*?(?=\n\n)/g,
    "\n",
  );

  const blocks: SubtitleBlock[] = [];
  const chunks = noNotes.split(/\n\n+/);

  for (const chunk of chunks) {
    const lines = chunk.split("\n").filter((line) => line.length > 0);
    const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIndex < 0) continue;

    const timeLine = lines[timeLineIndex]!;

    const timing = timeLine.match(/^(.+?)\s*-->\s*(.+)$/);
    if (!timing) continue;

    const start = parseClockTimestamp(timing[1]!.split(/\s+/)[0]!);
    const end = parseClockTimestamp(timing[2]!.split(/\s+/)[0]!);
    const body = lines
      .slice(timeLineIndex + 1)
      .join("\n")
      .trim();
    if (!body) continue;

    const parsed = stripVttMarkup(body);
    if (!parsed.text) continue;
    blocks.push({
      start,
      end,
      text: parsed.text,
      speakerName: parsed.speakerName,
    });
  }

  if (blocks.length === 0) {
    throw new Error("No WebVTT cues found");
  }
  return blocks;
}
