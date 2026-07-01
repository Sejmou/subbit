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

const shotRangeSchema = z
  .object({
    fromWord: z.number().int().nonnegative(),
    toWord: z.number().int().nonnegative(),
    shot: z.string(),
  })
  .refine((r) => r.toWord >= r.fromWord, {
    message: "toWord must be >= fromWord",
  });

const inferredSpeakerSchema = z.object({
  speakerId: z.string(),
  confidence: z.number().min(0).max(1),
});

const cueSchema = z
  .object({
    id: z.string(),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    speakerId: z.union([z.string(), z.null()]).default(null),
    words: z.array(wordSchema).default([]),
    lineBreakAfterWordIndices: z
      .array(z.number().int().nonnegative())
      .default([]),
    shotRanges: z.array(shotRangeSchema).default([]),
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

export const projectSchema = z.object({
  version: z.literal(PROJECT_VERSION),
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

function formatValidationError(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `Not a valid Subbit project file. ${path}${issue.message}`;
}

/** Validate parsed JSON as a Subbit project (v1). */
export function parseProjectData(data: unknown): Project {
  const result = projectSchema.safeParse(data);
  if (!result.success) throw new Error(formatValidationError(result.error));
  return result.data as Project;
}

/** True when the value looks like a saved Subbit project (not whisperx). */
export function isSubbitProject(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    obj.version === PROJECT_VERSION &&
    Array.isArray(obj.cues) &&
    Array.isArray(obj.speakers)
  );
}
