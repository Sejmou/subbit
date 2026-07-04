import { z } from "zod";
import type { Project } from "../types";
import { PROJECT_VERSION } from "../types";

const wordSchema = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
  speaker: z.string().nullable().optional(),
  score: z.number().optional(),
});

const inferredSpeakerSchema = z.object({
  speakerId: z.string(),
  confidence: z.number().min(0).max(1),
});

/** v1 cue: shot assignment stored as index ranges into `words`. */
const shotRangeSchemaV1 = z
  .object({
    fromWord: z.number().int().nonnegative(),
    toWord: z.number().int().nonnegative(),
    shot: z.string(),
  })
  .refine((r) => r.toWord >= r.fromWord, {
    message: "toWord must be >= fromWord",
  });

const cueSchemaV1 = z
  .object({
    id: z.string(),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    speakerId: z.union([z.string(), z.null()]).default(null),
    words: z.array(wordSchema).default([]),
    lineBreakAfterWordIndices: z
      .array(z.number().int().nonnegative())
      .default([]),
    shotRanges: z.array(shotRangeSchemaV1).default([]),
    reviewed: z.boolean().optional(),
    inferredSpeaker: inferredSpeakerSchema.nullable().optional(),
  })
  .refine((c) => c.end > c.start, {
    message: "end must be greater than start",
  })
  .strict();

/** v2 cue: single shot; " / " sequences are runs linked by `joinedToPrev`. */
const cueSchemaV2 = z
  .object({
    id: z.string(),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    speakerId: z.union([z.string(), z.null()]).default(null),
    words: z.array(wordSchema).default([]),
    lineBreakAfterWordIndices: z
      .array(z.number().int().nonnegative())
      .default([]),
    shot: z.string(),
    joinedToPrev: z.boolean().optional(),
    reviewed: z.boolean().optional(),
    inferredSpeaker: inferredSpeakerSchema.nullable().optional(),
  })
  .refine((c) => c.end > c.start, {
    message: "end must be greater than start",
  })
  .strict();

const speakerSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});

const shotTypeSchema = z.object({
  id: z.string(),
  label: z.string(),
});

const videoIdentitySchema = z
  .object({
    fileName: z.string().optional(),
    duration: z.number().nonnegative(),
    frameRateNumerator: z.number().int().positive().optional(),
    frameRateDenominator: z.number().int().positive().optional(),
    fileSize: z.number().int().nonnegative().optional(),
  })
  .superRefine((val, ctx) => {
    const hasNum = val.frameRateNumerator !== undefined;
    const hasDen = val.frameRateDenominator !== undefined;
    if (hasNum !== hasDen) {
      ctx.addIssue({
        code: "custom",
        message:
          "frameRateNumerator and frameRateDenominator must appear together",
      });
    }
  })
  .transform((val) => ({
    fileName: val.fileName,
    duration: val.duration,
    ...(val.fileSize !== undefined ? { fileSize: val.fileSize } : {}),
    ...(val.frameRateNumerator !== undefined &&
    val.frameRateDenominator !== undefined
      ? {
          frameRateNumerator: val.frameRateNumerator,
          frameRateDenominator: val.frameRateDenominator,
        }
      : {}),
  }));

function makeProjectSchema<C extends z.ZodTypeAny>(
  version: number,
  cueSchema: C,
) {
  return z.object({
    version: z.literal(version),
    id: z.uuid(),
    name: z.string().min(1),
    videoName: z.string(),
    video: videoIdentitySchema.optional(),
    fpsNumerator: z.number().int().positive(),
    fpsDenominator: z.number().int().positive(),
    startTimecode: z.string(),
    referenceStartSeconds: z.number().nonnegative(),
    defaultShot: z.string(),
    shots: z.array(shotTypeSchema),
    speakers: z.array(speakerSchema),
    cues: z.array(cueSchema),
  });
}

const projectSchemaV1 = makeProjectSchema(1, cueSchemaV1);
const projectSchemaV2 = makeProjectSchema(PROJECT_VERSION, cueSchemaV2);

/** Current-version project schema (v2). */
export const projectSchema = projectSchemaV2;

type CueV1 = z.infer<typeof cueSchemaV1>;
type CueV2 = z.infer<typeof cueSchemaV2>;
type ProjectV1 = z.infer<typeof projectSchemaV1>;

function genId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/**
 * Migrate a v1 cue to v2 cues. A single (or empty) shot range becomes one cue;
 * multiple ranges become a run of cues linked by `joinedToPrev`, split at the
 * range boundaries. The run keeps the original cue's outer [start, end] and
 * abuts internally; speaker/inferredSpeaker stay on the first cue only.
 */
function migrateCueV1toV2(cue: CueV1, defaultShot: string): CueV2[] {
  const ranges = cue.shotRanges;

  if (ranges.length <= 1) {
    const { shotRanges: _drop, ...rest } = cue;
    return [{ ...rest, shot: ranges[0]?.shot ?? defaultShot }];
  }

  const parts: { words: CueV1["words"]; breaks: number[]; shot: string }[] = [];
  for (const r of ranges) {
    const words = cue.words.slice(r.fromWord, r.toWord + 1);
    if (words.length === 0) continue;
    const breaks = cue.lineBreakAfterWordIndices
      .filter((b) => b >= r.fromWord && b <= r.toWord - 1)
      .map((b) => b - r.fromWord);
    parts.push({ words, breaks, shot: r.shot });
  }

  if (parts.length === 0) {
    const { shotRanges: _drop, ...rest } = cue;
    return [{ ...rest, shot: ranges[0]?.shot ?? defaultShot }];
  }

  // Lay out abutting boundaries: first start = cue.start, last end = cue.end,
  // internal seams at each part's natural word-end; keep every span positive.
  let prevEnd = cue.start;
  return parts.map((part, i): CueV2 => {
    const start = prevEnd;
    const natural =
      i === parts.length - 1 ? cue.end : (part.words.at(-1)?.end ?? start);
    const end = natural > start ? natural : start + 1e-3;
    prevEnd = end;
    return {
      id: i === 0 ? cue.id : genId(),
      start,
      end,
      speakerId: i === 0 ? cue.speakerId : null,
      words: part.words,
      lineBreakAfterWordIndices: part.breaks,
      shot: part.shot,
      ...(i === 0 ? {} : { joinedToPrev: true }),
      ...(cue.reviewed !== undefined ? { reviewed: cue.reviewed } : {}),
      ...(i === 0 && cue.inferredSpeaker != null
        ? { inferredSpeaker: cue.inferredSpeaker }
        : {}),
    };
  });
}

function migrateV1toV2(project: ProjectV1): unknown {
  return {
    ...project,
    version: PROJECT_VERSION,
    cues: project.cues.flatMap((c) => migrateCueV1toV2(c, project.defaultShot)),
  };
}

function formatValidationError(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `Not a valid Subbit project file. ${path}${issue.message}`;
}

function readVersion(data: unknown): number | undefined {
  if (typeof data !== "object" || data === null || !("version" in data)) {
    return undefined;
  }
  const v = (data as { version: unknown }).version;
  return typeof v === "number" ? v : undefined;
}

/** Validate parsed JSON as a Subbit project, migrating older versions to v2. */
export function parseProjectData(data: unknown): Project {
  if (readVersion(data) === 1) {
    const v1 = projectSchemaV1.safeParse(data);
    if (!v1.success) throw new Error(formatValidationError(v1.error));
    const migrated = projectSchemaV2.safeParse(migrateV1toV2(v1.data));
    if (!migrated.success)
      throw new Error(formatValidationError(migrated.error));
    return migrated.data as Project;
  }

  const result = projectSchemaV2.safeParse(data);
  if (!result.success) throw new Error(formatValidationError(result.error));
  return result.data as Project;
}

/** True when the value looks like a saved Subbit project (any known version). */
export function isSubbitProject(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    (obj.version === 1 || obj.version === PROJECT_VERSION) &&
    Array.isArray(obj.cues) &&
    Array.isArray(obj.speakers)
  );
}
