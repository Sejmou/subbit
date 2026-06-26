import { z } from 'zod'
import type { Project } from '../types'

const wordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
  speaker: z.string().nullable().optional(),
  score: z.number().optional(),
})

const segmentSchema = z.object({
  text: z.string(),
  shot: z.string(),
  mergedWithPrevious: z.boolean().optional(),
  mergedSpeakerId: z.string().nullable().optional(),
})

const cueSchema = z.object({
  id: z.string(),
  start: z.number(),
  end: z.number(),
  speakerId: z.string().nullable(),
  segments: z.array(segmentSchema).min(1),
  reviewed: z.boolean().optional(),
  multiSpeaker: z.boolean().optional(),
  words: z.array(wordSchema).optional(),
})

const speakerSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
})

const shotTypeSchema = z.object({
  id: z.string(),
  label: z.string(),
})

export const projectSchema = z.object({
  version: z.number(),
  videoName: z.string(),
  fps: z.number().positive(),
  timecodeOffset: z.string(),
  defaultShot: z.string(),
  shots: z.array(shotTypeSchema),
  speakers: z.array(speakerSchema),
  cues: z.array(cueSchema),
})

function formatValidationError(error: z.ZodError): string {
  const issue = error.issues[0]
  const path = issue.path.length ? `${issue.path.join('.')}: ` : ''
  return `Not a valid Subbit project file. ${path}${issue.message}`
}

/** Validate parsed JSON as a Subbit project. */
export function parseProjectData(data: unknown): Project {
  const result = projectSchema.safeParse(data)
  if (!result.success) throw new Error(formatValidationError(result.error))
  return result.data
}

/** True when the value looks like a saved Subbit project (not whisperx). */
export function isSubbitProject(data: unknown): boolean {
  return projectSchema.safeParse(data).success
}
