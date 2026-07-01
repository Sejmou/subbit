import { exportAss } from "./export-ass";
import { exportCsv } from "./export-csv";
import { exportSrt } from "./export-srt";
import { exportVtt } from "./export-vtt";
import { exportDeliveryExcel } from "./delivery-excel";
import type { DeliveryColumnMapping } from "./delivery-columns";
import { DEFAULT_DELIVERY_COLUMNS } from "./delivery-columns";
import type { Project } from "../types";

export type ExportFormat = "ass" | "vtt" | "srt" | "tsv" | "csv" | "xlsx";

export interface DiarizedExportOptions {
  speakerLabels: boolean;
  speakerColors: boolean;
}

export const DEFAULT_DIARIZED_EXPORT_OPTIONS: DiarizedExportOptions = {
  speakerLabels: true,
  speakerColors: true,
};

export interface ExportRequest {
  format: ExportFormat;
  diarized: DiarizedExportOptions;
  deliveryColumns: DeliveryColumnMapping;
}

export interface ExportFormatInfo {
  id: ExportFormat;
  label: string;
  ext: string;
  mime: string;
  hint: string;
  usesDeliveryOffset: boolean;
  supportsDiarization: boolean;
  isDeliverySpreadsheet: boolean;
}

export const EXPORT_FORMATS: ExportFormatInfo[] = [
  {
    id: "ass",
    label: "ASS/SSA",
    ext: "ass",
    mime: "text/plain",
    hint: "Styled subtitles for VLC, mpv, and similar players. Times use subtitle SMPTE from the reference frame. Optional per-speaker colors and labels.",
    usesDeliveryOffset: false,
    supportsDiarization: true,
    isDeliverySpreadsheet: false,
  },
  {
    id: "vtt",
    label: "WebVTT",
    ext: "vtt",
    mime: "text/vtt",
    hint: "Web and streaming subtitles. Times use subtitle SMPTE from the reference frame. Optional voice tags and per-speaker CSS colors.",
    usesDeliveryOffset: false,
    supportsDiarization: true,
    isDeliverySpreadsheet: false,
  },
  {
    id: "srt",
    label: "SRT",
    ext: "srt",
    mime: "text/plain",
    hint: "Plain subtitles from subtitle zero at the reference frame. No speaker or shot metadata.",
    usesDeliveryOffset: false,
    supportsDiarization: false,
    isDeliverySpreadsheet: false,
  },
  {
    id: "xlsx",
    label: "Excel (.xlsx)",
    ext: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    hint: "Delivery spreadsheet with SMPTE timecodes (start timecode + reference frame), Rolle, shot info, and subtitle text.",
    usesDeliveryOffset: true,
    supportsDiarization: false,
    isDeliverySpreadsheet: true,
  },
  {
    id: "tsv",
    label: "TSV (tab)",
    ext: "tsv",
    mime: "text/tab-separated-values",
    hint: "Delivery spreadsheet with SMPTE timecodes (start timecode + reference frame), Rolle, shot info, and subtitle text.",
    usesDeliveryOffset: true,
    supportsDiarization: false,
    isDeliverySpreadsheet: true,
  },
  {
    id: "csv",
    label: "CSV (comma)",
    ext: "csv",
    mime: "text/csv",
    hint: "Delivery spreadsheet (comma-separated, RFC 4180 quoting). SMPTE uses start timecode at the reference frame.",
    usesDeliveryOffset: true,
    supportsDiarization: false,
    isDeliverySpreadsheet: true,
  },
];

export function exportFormatInfo(format: ExportFormat): ExportFormatInfo {
  return EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0];
}

export function defaultExportRequest(
  format: ExportFormat = "ass",
): ExportRequest {
  return {
    format,
    diarized: DEFAULT_DIARIZED_EXPORT_OPTIONS,
    deliveryColumns: { ...DEFAULT_DELIVERY_COLUMNS },
  };
}

export type ExportResult =
  | { kind: "text"; content: string; ext: string; mime: string }
  | { kind: "binary"; content: ArrayBuffer; ext: string; mime: string };

export async function buildExportFile(
  project: Project,
  request: ExportRequest,
): Promise<ExportResult> {
  const { format, diarized, deliveryColumns } = request;
  const info = exportFormatInfo(format);
  switch (format) {
    case "ass":
      return {
        kind: "text",
        content: exportAss(project, diarized),
        ext: info.ext,
        mime: info.mime,
      };
    case "vtt":
      return {
        kind: "text",
        content: exportVtt(project, diarized),
        ext: info.ext,
        mime: info.mime,
      };
    case "srt":
      return {
        kind: "text",
        content: exportSrt(project),
        ext: info.ext,
        mime: info.mime,
      };
    case "tsv":
      return {
        kind: "text",
        content: exportCsv(project, "\t", deliveryColumns),
        ext: info.ext,
        mime: info.mime,
      };
    case "csv":
      return {
        kind: "text",
        content: exportCsv(project, ",", deliveryColumns),
        ext: info.ext,
        mime: info.mime,
      };
    case "xlsx":
      return {
        kind: "binary",
        content: await exportDeliveryExcel(project, deliveryColumns),
        ext: info.ext,
        mime: info.mime,
      };
  }
}

/** @deprecated Use buildExportFile */
export function buildExport(
  project: Project,
  request: ExportRequest,
): { content: string; ext: string; mime: string } {
  const { format, diarized, deliveryColumns } = request;
  const info = exportFormatInfo(format);
  if (format === "xlsx") {
    throw new Error("Use buildExportFile for xlsx exports");
  }
  switch (format) {
    case "ass":
      return {
        content: exportAss(project, diarized),
        ext: info.ext,
        mime: info.mime,
      };
    case "vtt":
      return {
        content: exportVtt(project, diarized),
        ext: info.ext,
        mime: info.mime,
      };
    case "srt":
      return { content: exportSrt(project), ext: info.ext, mime: info.mime };
    case "tsv":
      return {
        content: exportCsv(project, "\t", deliveryColumns),
        ext: info.ext,
        mime: info.mime,
      };
    case "csv":
      return {
        content: exportCsv(project, ",", deliveryColumns),
        ext: info.ext,
        mime: info.mime,
      };
  }
}
