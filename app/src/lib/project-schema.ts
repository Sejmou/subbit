import { z } from "zod";
import type { Project } from "../types";

const wordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
  speaker: z.string().nullable().optional(),
  score: z.number().optional(),
});

const segmentSchema = z.object({
  text: z.string(),
  shot: z.string(),
});

const inferredSpeakerSchema = z.object({
  speakerId: z.string(),
  confidence: z.number().min(0).max(1),
});

const cueSchema = z.object({
  id: z.string(),
  start: z.number(),
  end: z.number(),
  speakerId: z.union([z.string(), z.null()]).default(null),
  segments: z.array(segmentSchema).min(1),
  reviewed: z.boolean().optional(),
  inferredSpeaker: inferredSpeakerSchema.nullable().optional(),
  words: z.array(wordSchema).optional(),
});

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
    fingerprint: z.string().optional(),
    fingerprintVersion: z.number().int().positive().optional(),
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
    ...(val.frameRateNumerator !== undefined &&
    val.frameRateDenominator !== undefined
      ? {
          frameRateNumerator: val.frameRateNumerator,
          frameRateDenominator: val.frameRateDenominator,
        }
      : {}),
  }));

export const projectSchema = z.object({
  version: z.number(),
  id: z.uuid(),
  name: z.string().min(1),
  videoName: z.string(),
  video: videoIdentitySchema.optional(),
  fps: z.number().positive(),
  timecodeOffset: z.string(),
  contentStartSeconds: z.number().nonnegative().optional(),
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

/** Validate parsed JSON as a Subbit project. */
export function parseProjectData(data: unknown): Project {
  const result = projectSchema.safeParse(data);
  if (!result.success) throw new Error(formatValidationError(result.error));
  return result.data;
}

/** True when the value looks like a saved Subbit project (not whisperx). */
export function isSubbitProject(data: unknown): boolean {
  return projectSchema.safeParse(data).success;
}
