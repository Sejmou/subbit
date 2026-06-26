import {
  DEFAULT_FPS,
  DEFAULT_SHOTS,
  DEFAULT_TIMECODE_OFFSET,
  PROJECT_VERSION,
  type Cue,
  type Project,
  type Speaker,
  type Word,
} from '../types'

/** Shape of the whisperx `audio.json` output we care about. */
interface WhisperxWord {
  word: string
  start?: number
  end?: number
  score?: number
  speaker?: string | null
}

interface WhisperxSegment {
  start: number
  end: number
  text: string
  speaker?: string | null
  words?: WhisperxWord[]
}

interface WhisperxJson {
  segments: WhisperxSegment[]
  language?: string
}

const SPEAKER_PALETTE = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080',
  '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000',
  '#ffd8b1', '#000075', '#a9a9a9',
]

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

/** True if the segment's words were attributed to more than one speaker. */
function isMultiSpeaker(words: WhisperxWord[] | undefined): boolean {
  if (!words) return false
  const speakers = new Set(words.map((w) => w.speaker).filter(Boolean))
  return speakers.size > 1
}

/**
 * Build a fresh Project from whisperx JSON.
 * Each segment becomes one cue with a single (default-shot) segment; the
 * diarization speaker is carried over and word timing is preserved.
 */
export function importWhisperx(json: WhisperxJson, videoName: string): Project {
  const segments = json.segments ?? []
  const defaultShot = DEFAULT_SHOTS[0].id

  const cues: Cue[] = segments.map((seg) => {
    const words: Word[] | undefined = seg.words?.map((w) => ({
      word: w.word,
      start: w.start ?? seg.start,
      end: w.end ?? seg.end,
      speaker: w.speaker ?? null,
      score: w.score,
    }))

    return {
      id: newId(),
      start: seg.start,
      end: seg.end,
      speakerId: seg.speaker ?? null,
      segments: [{ text: seg.text.trim(), shot: defaultShot }],
      reviewed: false,
      multiSpeaker: isMultiSpeaker(seg.words),
      words,
    }
  })

  const speakers = buildSpeakers(segments)

  return {
    version: PROJECT_VERSION,
    videoName,
    fps: DEFAULT_FPS,
    timecodeOffset: DEFAULT_TIMECODE_OFFSET,
    defaultShot,
    shots: DEFAULT_SHOTS,
    speakers,
    cues,
  }
}

/** Distinct diarization labels become speakers, sorted, with a stable color. */
function buildSpeakers(segments: WhisperxSegment[]): Speaker[] {
  const labels = new Set<string>()
  for (const seg of segments) {
    if (seg.speaker) labels.add(seg.speaker)
    for (const w of seg.words ?? []) if (w.speaker) labels.add(w.speaker)
  }
  return [...labels]
    .sort()
    .map((id, i) => ({
      id,
      name: id, // editable; user renames e.g. SPEAKER_07 -> "Mia"
      color: SPEAKER_PALETTE[i % SPEAKER_PALETTE.length],
    }))
}

/** Parse + validate a JSON string as whisperx output. */
export function parseWhisperxJson(text: string): WhisperxJson {
  const data = JSON.parse(text)
  if (!data || !Array.isArray(data.segments)) {
    throw new Error('Not a whisperx JSON file (missing "segments" array).')
  }
  return data as WhisperxJson
}
