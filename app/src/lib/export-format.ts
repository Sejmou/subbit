import { exportAss } from './export-ass'
import { exportCsv } from './export-csv'
import { exportSrt } from './export-srt'
import { exportVtt } from './export-vtt'
import type { Project } from '../types'

export type ExportFormat = 'ass' | 'vtt' | 'srt' | 'tsv' | 'csv'

export interface DiarizedExportOptions {
  speakerLabels: boolean
  speakerColors: boolean
}

export const DEFAULT_DIARIZED_EXPORT_OPTIONS: DiarizedExportOptions = {
  speakerLabels: true,
  speakerColors: true,
}

export interface ExportRequest {
  format: ExportFormat
  diarized: DiarizedExportOptions
}

export interface ExportFormatInfo {
  id: ExportFormat
  label: string
  ext: string
  mime: string
  hint: string
  usesDeliveryOffset: boolean
  supportsDiarization: boolean
}

export const EXPORT_FORMATS: ExportFormatInfo[] = [
  {
    id: 'ass',
    label: 'ASS/SSA',
    ext: 'ass',
    mime: 'text/plain',
    hint: 'Styled subtitles for VLC, mpv, and similar players. Optional per-speaker colors and labels.',
    usesDeliveryOffset: false,
    supportsDiarization: true,
  },
  {
    id: 'vtt',
    label: 'WebVTT',
    ext: 'vtt',
    mime: 'text/vtt',
    hint: 'Web and streaming subtitles. Optional voice tags and per-speaker CSS colors.',
    usesDeliveryOffset: false,
    supportsDiarization: true,
  },
  {
    id: 'srt',
    label: 'SRT',
    ext: 'srt',
    mime: 'text/plain',
    hint: 'Plain subtitles from the start of the video file. No speaker or shot metadata.',
    usesDeliveryOffset: false,
    supportsDiarization: false,
  },
  {
    id: 'tsv',
    label: 'TSV (tab)',
    ext: 'tsv',
    mime: 'text/tab-separated-values',
    hint: 'Delivery spreadsheet with SMPTE timecodes, Rolle, shot info, and subtitle text.',
    usesDeliveryOffset: true,
    supportsDiarization: false,
  },
  {
    id: 'csv',
    label: 'CSV (comma)',
    ext: 'csv',
    mime: 'text/csv',
    hint: 'Delivery spreadsheet (comma-separated, RFC 4180 quoting).',
    usesDeliveryOffset: true,
    supportsDiarization: false,
  },
]

export function exportFormatInfo(format: ExportFormat): ExportFormatInfo {
  return EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0]
}

export function buildExport(
  project: Project,
  request: ExportRequest,
): { content: string; ext: string; mime: string } {
  const { format, diarized } = request
  const info = exportFormatInfo(format)
  switch (format) {
    case 'ass':
      return { content: exportAss(project, diarized), ext: info.ext, mime: info.mime }
    case 'vtt':
      return { content: exportVtt(project, diarized), ext: info.ext, mime: info.mime }
    case 'srt':
      return { content: exportSrt(project), ext: info.ext, mime: info.mime }
    case 'tsv':
      return { content: exportCsv(project, '\t'), ext: info.ext, mime: info.mime }
    case 'csv':
      return { content: exportCsv(project, ','), ext: info.ext, mime: info.mime }
  }
}
