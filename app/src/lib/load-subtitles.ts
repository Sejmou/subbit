import { importWhisperx, parseWhisperxData } from "./import-whisperx";
import { parseProjectData } from "./project-schema";
import type { Project } from "../types";

const JSON_PARSE_ERROR =
  "Could not parse file as JSON. Select a whisperx audio.json or a saved .subbit.json project file.";

function formatUnrecognizedError(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return "Expected a JSON object containing either whisperx transcription data or a Subbit project.";
  }
  const keys = Object.keys(data);
  const keyHint = keys.length
    ? `Found top-level keys: ${keys.map((k) => `"${k}"`).join(", ")}. `
    : "The file is an empty object. ";
  return (
    `${keyHint}Expected a whisperx audio.json (with a "segments" array) or a Subbit project file ` +
    '(with "version", "cues", and "speakers").'
  );
}

/** Parse subtitle JSON text, throwing a user-facing error on invalid JSON. */
export function parseSubtitleJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(JSON_PARSE_ERROR);
  }
}

/**
 * Build a project from parsed subtitle JSON, auto-detecting whisperx vs saved
 * Subbit project and validating the detected format.
 */
export function projectFromSubtitleData(
  data: unknown,
  videoName: string,
): Project {
  if (typeof data !== "object" || data === null) {
    throw new Error("Expected a JSON object at the root of the file.");
  }

  const obj = data as Record<string, unknown>;
  const hasCues = Array.isArray(obj.cues);
  const hasSpeakers = Array.isArray(obj.speakers);
  const hasSegments = Array.isArray(obj.segments);
  const hasVersion = typeof obj.version === "number";

  if (hasCues || hasVersion || hasSpeakers) {
    if (!hasCues) {
      throw new Error(
        hasVersion
          ? 'Looks like a Subbit project file (has "version") but is missing the "cues" array.'
          : 'Looks like a Subbit project file (has "speakers") but is missing the "cues" array.',
      );
    }
    if (!hasSpeakers) {
      throw new Error(
        'Looks like a Subbit project file (has "cues") but is missing the "speakers" array.',
      );
    }
    return parseProjectData(data);
  }

  if (hasSegments) {
    return importWhisperx(parseWhisperxData(data), videoName);
  }

  throw new Error(formatUnrecognizedError(data));
}

/** Load whisperx JSON only (menu action), with format-specific errors. */
export function projectFromWhisperxData(
  data: unknown,
  videoName: string,
): Project {
  return importWhisperx(parseWhisperxData(data), videoName);
}
