import { parseAssTimestamp } from "./parse-subtitle-time";
import type { SubtitleBlock } from "./subtitle-blocks";

function unescapeAssText(text: string): string {
  return text
    .replace(/\\N/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\h/g, " ")
    .replace(/\\\{/g, "{")
    .replace(/\\\}/g, "}")
    .replace(/\\\\/g, "\\");
}

function parseAssDialogue(line: string): SubtitleBlock | null {
  if (!line.startsWith("Dialogue:")) return null;
  const body = line.slice("Dialogue:".length).trim();
  const parts = body.split(",");
  if (parts.length < 10) return null;

  const start = parseAssTimestamp(parts[1]!);
  const end = parseAssTimestamp(parts[2]!);
  const style = parts[3]!.trim();
  const name = parts[4]!.trim();
  const text = unescapeAssText(parts.slice(9).join(",")).trim();
  if (!text) return null;

  const speakerName = name || (style !== "Default" ? style : undefined);
  return { start, end, text, speakerName };
}

/** Parse ASS/SSA (.ass) dialogue lines into subtitle blocks. */
export function parseAss(text: string): SubtitleBlock[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks: SubtitleBlock[] = [];

  for (const line of normalized.split("\n")) {
    const block = parseAssDialogue(line.trim());
    if (block) blocks.push(block);
  }

  if (blocks.length === 0) {
    throw new Error("No ASS dialogue lines found");
  }
  return blocks;
}
